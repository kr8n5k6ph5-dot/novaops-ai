
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Stripe = require("stripe");
const OpenAI = require("openai");
const { v4: uuid } = require("uuid");
const fs = require("fs");
const path = require("path");
const initSqlJs = require("sql.js");
require("dotenv").config();

const app = express();
const stripeSecretKey = process.env.STRIPE_SECRET_KEY || "";
const stripe = stripeSecretKey && stripeSecretKey.startsWith("sk_")
  ? new Stripe(stripeSecretKey)
  : null;

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;
const DB_FILE = path.join(__dirname, "novaops.sqlite");

app.use(cors());
app.use(express.json());

app.use((req,res,next) => {
  console.log(new Date().toISOString(), req.method, req.path);
  next();
});

let db;

function saveDb() {
  const data = db.export();
  fs.writeFileSync(DB_FILE, Buffer.from(data));
}

function selectOne(sql, params) {
  const stmt = db.prepare(sql);
  stmt.bind(params || []);
  const row = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return row;
}

function selectAll(sql, params) {
  const stmt = db.prepare(sql);
  stmt.bind(params || []);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function execute(sql, params) {
  db.run(sql, params || []);
  saveDb();
}

function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Missing token" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "change_this_secret_later");
    const freshUser = db ? selectOne("SELECT id, email, businessName, plan, role FROM users WHERE id = ?", [decoded.id]) : null;

    req.user = {
      ...decoded,
      plan: freshUser ? freshUser.plan : decoded.plan,
      role: freshUser ? freshUser.role : decoded.role,
      businessName: freshUser ? freshUser.businessName : decoded.businessName
    };

    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid token" });
  }
}

async function main() {
  const SQL = await initSqlJs({
    locateFile: file => path.join(__dirname, "node_modules/sql.js/dist", file)
  });

  if (fs.existsSync(DB_FILE)) {
    db = new SQL.Database(fs.readFileSync(DB_FILE));
    console.log("Loaded existing database.");
  } else {
    db = new SQL.Database();
    console.log("Created new database.");
  }

  db.run("CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE, businessName TEXT, passwordHash TEXT, plan TEXT, role TEXT, createdAt TEXT)");
  db.run("CREATE TABLE IF NOT EXISTS inventory (id TEXT PRIMARY KEY, userId TEXT, name TEXT, sku TEXT, quantity REAL, reorderPoint REAL, supplierName TEXT, supplierEmail TEXT, cost REAL, salesLast30Days REAL, createdAt TEXT)");
  db.run("CREATE TABLE IF NOT EXISTS employees (id TEXT PRIMARY KEY, userId TEXT, name TEXT, role TEXT, payType TEXT, payRate REAL, performanceScore REAL, createdAt TEXT)");
  db.run("CREATE TABLE IF NOT EXISTS payroll_runs (id TEXT PRIMARY KEY, userId TEXT, employeeId TEXT, employeeName TEXT, grossPay REAL, estimatedTax REAL, netPay REAL, status TEXT, createdAt TEXT)");
  db.run("CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, userId TEXT, itemId TEXT, itemName TEXT, quantityOrdered REAL, status TEXT, createdAt TEXT)");
  db.run("CREATE TABLE IF NOT EXISTS appointments (id TEXT PRIMARY KEY, userId TEXT, customerName TEXT, appointmentDate TEXT, appointmentTime TEXT, location TEXT, status TEXT, notes TEXT, createdAt TEXT)");
  db.run("CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, userId TEXT, title TEXT, assignedTo TEXT, priority TEXT, dueDate TEXT, status TEXT, notes TEXT, createdAt TEXT)");
  db.run("CREATE TABLE IF NOT EXISTS vehicles (id TEXT PRIMARY KEY, userId TEXT, name TEXT, vin TEXT, mileage REAL, insuranceExpiration TEXT, registrationExpiration TEXT, maintenanceDue TEXT, status TEXT, notes TEXT, createdAt TEXT)");
  db.run(`
  CREATE TABLE IF NOT EXISTS ai_actions (
    id TEXT PRIMARY KEY,
    type TEXT,
    title TEXT,
    description TEXT,
    status TEXT,
    createdAt TEXT
  )
`);
saveDb();

  app.get("/", function(req, res) {
    res.json({ app: "NovaOps AI", status: "running", database: "SQLite active" });
  });

  app.post("/auth/signup", async function(req, res) {
    try {
      const email = req.body.email;
      const password = req.body.password;
      const businessName = req.body.businessName || "My Business";

      if (!email || !password) return res.status(400).json({ error: "Email and password required" });

      const existing = selectOne("SELECT id FROM users WHERE email = ?", [email]);
      if (existing) return res.status(400).json({ error: "User already exists" });

      const countRow = selectOne("SELECT COUNT(*) AS count FROM users", []);
      const role = countRow.count === 0 ? "admin" : "user";
      const id = uuid();
      const passwordHash = await bcrypt.hash(password, 10);
      const createdAt = new Date().toISOString();

      execute(
        "INSERT INTO users (id, email, businessName, passwordHash, plan, role, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [id, email, businessName, passwordHash, "free", role, createdAt]
      );

      const token = jwt.sign({ id, email, role, plan: "free" }, process.env.JWT_SECRET || "change_this_secret_later");

      res.json({
        token,
        user: { id, email, businessName, plan: "free", role }
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/auth/login", async function(req, res) {
    try {
      const email = req.body.email;
      const password = req.body.password;

      const user = selectOne("SELECT * FROM users WHERE email = ?", [email]);
      if (!user) return res.status(401).json({ error: "Invalid login" });

      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) return res.status(401).json({ error: "Invalid login" });

      const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role, plan: user.plan },
        process.env.JWT_SECRET || "change_this_secret_later"
      );

      res.json({
        token,
        user: {
          id: user.id,
          email: user.email,
          businessName: user.businessName,
          plan: user.plan,
          role: user.role
        }
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/dashboard", auth, function(req, res) {
    const totalInventoryItems = selectOne("SELECT COUNT(*) AS count FROM inventory WHERE userId = ?", [req.user.id]).count;
    const lowStockItems = selectOne("SELECT COUNT(*) AS count FROM inventory WHERE userId = ? AND quantity <= reorderPoint", [req.user.id]).count;
    const totalEmployees = selectOne("SELECT COUNT(*) AS count FROM employees WHERE userId = ?", [req.user.id]).count;
    const payroll = selectOne("SELECT COALESCE(SUM(payRate), 0) AS total FROM employees WHERE userId = ?", [req.user.id]).total;
    const totalInventoryValue = selectOne("SELECT COALESCE(SUM(quantity * cost), 0) AS total FROM inventory WHERE userId = ?", [req.user.id]).total;
    const totalOrders = selectOne("SELECT COUNT(*) AS count FROM orders WHERE userId = ?", [req.user.id]).count;
    const openOrders = selectOne("SELECT COUNT(*) AS count FROM orders WHERE userId = ? AND status NOT IN ('received', 'completed', 'cancelled')", [req.user.id]).count;
    const aiActionsNeedingApproval = req.user.role === "admin"
      ? selectOne("SELECT COUNT(*) AS count FROM ai_actions WHERE status = ?", ["needs_approval"]).count
      : 0;

    res.json({
      totalInventoryItems,
      lowStockItems,
      totalEmployees,
      monthlyPayrollEstimate: payroll || 0,
      totalInventoryValue: totalInventoryValue || 0,
      totalOrders,
      openOrders,
      aiActionsNeedingApproval,
      plan: req.user.plan,
      role: req.user.role,
      inventoryLimit: req.user.plan === "pro" ? "unlimited" : 5,
      employeeLimit: req.user.plan === "pro" ? "unlimited" : 2
    });
  });

  app.get("/inventory", auth, function(req, res) {
    res.json(selectAll("SELECT * FROM inventory WHERE userId = ? ORDER BY createdAt DESC", [req.user.id]));
  });

  app.post("/inventory", auth, function(req, res) {
    if (req.user.plan !== "pro") {
      const currentInventoryCount = selectOne("SELECT COUNT(*) AS count FROM inventory WHERE userId = ?", [req.user.id]).count;
  if (currentInventoryCount >= 5) {
        return res.status(403).json({
          error: "Free tier inventory limit reached. Upgrade to Pro for unlimited inventory."
        });
      }
    }

    const item = {
      id: uuid(),
      userId: req.user.id,
      name: req.body.name || "New Item",
      sku: req.body.sku || "",
      quantity: Number(req.body.quantity || 0),
      reorderPoint: Number(req.body.reorderPoint || 5),
      supplierName: req.body.supplierName || "",
      supplierEmail: req.body.supplierEmail || "",
      cost: Number(req.body.cost || 0),
      salesLast30Days: Number(req.body.salesLast30Days || 0),
      createdAt: new Date().toISOString()
    };

    execute(
      "INSERT INTO inventory (id, userId, name, sku, quantity, reorderPoint, supplierName, supplierEmail, cost, salesLast30Days, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [item.id, item.userId, item.name, item.sku, item.quantity, item.reorderPoint, item.supplierName, item.supplierEmail, item.cost, item.salesLast30Days, item.createdAt]
    );

    res.json(item);
  });


  app.put("/inventory/:id", auth, function(req, res) {
    const item = selectOne("SELECT * FROM inventory WHERE id = ? AND userId = ?", [req.params.id, req.user.id]);
    if (!item) return res.status(404).json({ error: "Item not found" });

    const updated = {
      name: req.body.name || item.name,
      sku: req.body.sku || item.sku || "",
      quantity: req.body.quantity !== undefined ? Number(req.body.quantity) : Number(item.quantity),
      reorderPoint: req.body.reorderPoint !== undefined ? Number(req.body.reorderPoint) : Number(item.reorderPoint),
      supplierName: req.body.supplierName || item.supplierName || "",
      supplierEmail: req.body.supplierEmail || item.supplierEmail || "",
      cost: req.body.cost !== undefined ? Number(req.body.cost) : Number(item.cost || 0),
      salesLast30Days: req.body.salesLast30Days !== undefined ? Number(req.body.salesLast30Days) : Number(item.salesLast30Days || 0)
    };

    execute(
      "UPDATE inventory SET name = ?, sku = ?, quantity = ?, reorderPoint = ?, supplierName = ?, supplierEmail = ?, cost = ?, salesLast30Days = ? WHERE id = ? AND userId = ?",
      [updated.name, updated.sku, updated.quantity, updated.reorderPoint, updated.supplierName, updated.supplierEmail, updated.cost, updated.salesLast30Days, req.params.id, req.user.id]
    );

    const saved = selectOne("SELECT * FROM inventory WHERE id = ? AND userId = ?", [req.params.id, req.user.id]);
    res.json(saved);
  });

  app.delete("/inventory/:id", auth, function(req, res) {
    const item = selectOne("SELECT * FROM inventory WHERE id = ? AND userId = ?", [req.params.id, req.user.id]);
    if (!item) return res.status(404).json({ error: "Item not found" });

    execute("DELETE FROM inventory WHERE id = ? AND userId = ?", [req.params.id, req.user.id]);
    res.json({ ok: true, deleted: item });
  });

  app.post("/inventory/:id/reorder", auth, function(req, res) {
    const item = selectOne("SELECT * FROM inventory WHERE id = ? AND userId = ?", [req.params.id, req.user.id]);
    if (!item) return res.status(404).json({ error: "Item not found" });

    const order = {
      id: uuid(),
      userId: req.user.id,
      itemId: item.id,
      itemName: item.name,
      quantityOrdered: Number(req.body.quantityOrdered || item.reorderPoint * 2),
      status: "pending_approval",
      createdAt: new Date().toISOString()
    };

    execute(
      "INSERT INTO orders (id, userId, itemId, itemName, quantityOrdered, status, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [order.id, order.userId, order.itemId, order.itemName, order.quantityOrdered, order.status, order.createdAt]
    );

    res.json(order);
  });

  
  // Workforce Management V1 safe schema migration
  try { execute("ALTER TABLE employees ADD COLUMN attendancePercent REAL DEFAULT 0"); } catch (e) {}
  try { execute("ALTER TABLE employees ADD COLUMN certifications TEXT DEFAULT ''"); } catch (e) {}
  try { execute("ALTER TABLE employees ADD COLUMN certificationExpiration TEXT DEFAULT ''"); } catch (e) {}
  try { execute("ALTER TABLE employees ADD COLUMN managerNotes TEXT DEFAULT ''"); } catch (e) {}
  try { execute("ALTER TABLE employees ADD COLUMN lastReviewDate TEXT DEFAULT ''"); } catch (e) {}


  // Workforce Management V2 Clock In/Out schema
  execute(`CREATE TABLE IF NOT EXISTS time_entries (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    employeeId TEXT NOT NULL,
    employeeName TEXT DEFAULT '',
    clockInAt TEXT NOT NULL,
    clockOutAt TEXT DEFAULT '',
    hoursWorked REAL DEFAULT 0,
    status TEXT DEFAULT 'open',
    createdAt TEXT NOT NULL
  )`);

  app.get("/employees", auth, function(req, res) {
    res.json(selectAll("SELECT * FROM employees WHERE userId = ? ORDER BY createdAt DESC", [req.user.id]));
  });

  app.post("/employees", auth, function(req, res) {
    if (req.user.plan !== "pro") {
      const currentEmployeeCount = selectOne("SELECT COUNT(*) AS count FROM employees WHERE userId = ?", [req.user.id]).count;
      if (currentEmployeeCount >= 2) {
        return res.status(403).json({
          error: "Free tier employee limit reached. Upgrade to Pro for unlimited employees."
        });
      }
    }

    const employee = {
      id: uuid(),
      userId: req.user.id,
      name: req.body.name || "New Employee",
      role: req.body.role || "",
      payType: req.body.payType || "hourly",
      payRate: Number(req.body.payRate || 0),
      performanceScore: Number(req.body.performanceScore || 0),
      attendancePercent: Number(req.body.attendancePercent || 0),
      certifications: req.body.certifications || "",
      certificationExpiration: req.body.certificationExpiration || "",
      managerNotes: req.body.managerNotes || "",
      lastReviewDate: req.body.lastReviewDate || "",
      createdAt: new Date().toISOString()
    };

    execute(
      "INSERT INTO employees (id, userId, name, role, payType, payRate, performanceScore, attendancePercent, certifications, certificationExpiration, managerNotes, lastReviewDate, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [employee.id, employee.userId, employee.name, employee.role, employee.payType, employee.payRate, employee.performanceScore, employee.attendancePercent, employee.certifications, employee.certificationExpiration, employee.managerNotes, employee.lastReviewDate, employee.createdAt]
    );

    res.json(employee);
  });


  app.put("/employees/:id", auth, function(req, res) {
    const employee = selectOne("SELECT * FROM employees WHERE id = ? AND userId = ?", [req.params.id, req.user.id]);
    if (!employee) return res.status(404).json({ error: "Employee not found" });

    const updated = {
      name: req.body.name || employee.name,
      role: req.body.role || employee.role || "",
      payType: req.body.payType || employee.payType || "hourly",
      payRate: req.body.payRate !== undefined ? Number(req.body.payRate) : Number(employee.payRate || 0),
      performanceScore: req.body.performanceScore !== undefined ? Number(req.body.performanceScore) : Number(employee.performanceScore || 0),
      attendancePercent: req.body.attendancePercent !== undefined ? Number(req.body.attendancePercent) : Number(employee.attendancePercent || 0),
      certifications: req.body.certifications !== undefined ? req.body.certifications : employee.certifications || "",
      certificationExpiration: req.body.certificationExpiration !== undefined ? req.body.certificationExpiration : employee.certificationExpiration || "",
      managerNotes: req.body.managerNotes !== undefined ? req.body.managerNotes : employee.managerNotes || "",
      lastReviewDate: req.body.lastReviewDate !== undefined ? req.body.lastReviewDate : employee.lastReviewDate || ""
    };

    execute(
      "UPDATE employees SET name = ?, role = ?, payType = ?, payRate = ?, performanceScore = ?, attendancePercent = ?, certifications = ?, certificationExpiration = ?, managerNotes = ?, lastReviewDate = ? WHERE id = ? AND userId = ?",
      [updated.name, updated.role, updated.payType, updated.payRate, updated.performanceScore, updated.attendancePercent, updated.certifications, updated.certificationExpiration, updated.managerNotes, updated.lastReviewDate, req.params.id, req.user.id]
    );

    const saved = selectOne("SELECT * FROM employees WHERE id = ? AND userId = ?", [req.params.id, req.user.id]);
    res.json(saved);
  });

  app.delete("/employees/:id", auth, function(req, res) {
    const employee = selectOne("SELECT * FROM employees WHERE id = ? AND userId = ?", [req.params.id, req.user.id]);
    if (!employee) return res.status(404).json({ error: "Employee not found" });

    execute("DELETE FROM employees WHERE id = ? AND userId = ?", [req.params.id, req.user.id]);
    res.json({ ok: true, deleted: employee });
  });


  app.get("/time-entries", auth, function(req, res) {
    const rows = selectAll(
      "SELECT * FROM time_entries WHERE userId = ? ORDER BY createdAt DESC LIMIT 100",
      [req.user.id]
    );
    res.json(rows);
  });

  app.post("/time-entries/clock-in", auth, function(req, res) {
    const employee = selectOne(
      "SELECT * FROM employees WHERE id = ? AND userId = ?",
      [req.body.employeeId, req.user.id]
    );

    if (!employee) return res.status(404).json({ error: "Employee not found" });

    const openEntry = selectOne(
      "SELECT * FROM time_entries WHERE employeeId = ? AND userId = ? AND status = 'open'",
      [employee.id, req.user.id]
    );

    if (openEntry) {
      return res.status(400).json({ error: "Employee is already clocked in." });
    }

    const now = new Date().toISOString();

    const entry = {
      id: uuid(),
      userId: req.user.id,
      employeeId: employee.id,
      employeeName: employee.name,
      clockInAt: now,
      clockOutAt: "",
      hoursWorked: 0,
      status: "open",
      createdAt: now
    };

    execute(
      "INSERT INTO time_entries (id, userId, employeeId, employeeName, clockInAt, clockOutAt, hoursWorked, status, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [entry.id, entry.userId, entry.employeeId, entry.employeeName, entry.clockInAt, entry.clockOutAt, entry.hoursWorked, entry.status, entry.createdAt]
    );

    res.json(entry);
  });

  app.put("/time-entries/:id/clock-out", auth, function(req, res) {
    const entry = selectOne(
      "SELECT * FROM time_entries WHERE id = ? AND userId = ?",
      [req.params.id, req.user.id]
    );

    if (!entry) return res.status(404).json({ error: "Time entry not found" });
    if (entry.status !== "open") return res.status(400).json({ error: "Time entry is already closed." });

    const clockOutAt = new Date().toISOString();
    const start = new Date(entry.clockInAt);
    const end = new Date(clockOutAt);
    const hoursWorked = Math.round(((end - start) / (1000 * 60 * 60)) * 100) / 100;

    execute(
      "UPDATE time_entries SET clockOutAt = ?, hoursWorked = ?, status = ? WHERE id = ? AND userId = ?",
      [clockOutAt, hoursWorked, "closed", req.params.id, req.user.id]
    );

    const saved = selectOne(
      "SELECT * FROM time_entries WHERE id = ? AND userId = ?",
      [req.params.id, req.user.id]
    );

    res.json(saved);
  });


  app.post("/payroll/calculate", auth, function(req, res) {
    const employee = selectOne("SELECT * FROM employees WHERE id = ? AND userId = ?", [req.body.employeeId, req.user.id]);
    if (!employee) return res.status(404).json({ error: "Employee not found" });

    const hours = Number(req.body.hours || 0);
    const grossPay = employee.payType === "hourly" ? hours * employee.payRate : employee.payRate;
    const estimatedTax = grossPay * 0.15;
    const netPay = grossPay - estimatedTax;

    const runData = {
      id: uuid(),
      userId: req.user.id,
      employeeId: employee.id,
      employeeName: employee.name,
      grossPay,
      estimatedTax,
      netPay,
      status: "calculated_not_paid",
      createdAt: new Date().toISOString()
    };

    execute(
      "INSERT INTO payroll_runs (id, userId, employeeId, employeeName, grossPay, estimatedTax, netPay, status, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [runData.id, runData.userId, runData.employeeId, runData.employeeName, runData.grossPay, runData.estimatedTax, runData.netPay, runData.status, runData.createdAt]
    );

    res.json(runData);
  });


  app.get("/orders", auth, function(req, res) {
    const orders = selectAll("SELECT * FROM orders WHERE userId = ? ORDER BY createdAt DESC", [req.user.id]);
    res.json(orders);
  });

  app.put("/orders/:id/status", auth, function(req, res) {
    const order = selectOne("SELECT * FROM orders WHERE id = ? AND userId = ?", [req.params.id, req.user.id]);
    if (!order) return res.status(404).json({ error: "Order not found" });

    const status = req.body.status || "pending_approval";

    execute(
      "UPDATE orders SET status = ? WHERE id = ? AND userId = ?",
      [status, req.params.id, req.user.id]
    );

    const saved = selectOne("SELECT * FROM orders WHERE id = ? AND userId = ?", [req.params.id, req.user.id]);
    res.json(saved);
  });



  app.post("/ai/supplier-order", auth, function(req, res) {
    try {
      const inventory = selectAll("SELECT * FROM inventory WHERE userId = ?", [req.user.id]);

      if (!inventory || inventory.length === 0) {
        return res.status(400).json({ error: "No inventory items found." });
      }

      let item = null;

      if (req.body && req.body.itemId) {
        item = selectOne("SELECT * FROM inventory WHERE id = ? AND userId = ?", [req.body.itemId, req.user.id]);
      }

      if (!item) {
        const ranked = inventory.slice().sort(function(a, b) {
          const aRatio = Number(a.quantity || 0) / Math.max(1, Number(a.reorderPoint || 1));
          const bRatio = Number(b.quantity || 0) / Math.max(1, Number(b.reorderPoint || 1));
          return aRatio - bRatio;
        });

        item = ranked[0];
      }

      if (!item) {
        return res.status(400).json({ error: "No inventory item selected." });
      }

      const currentStock = Number(item.quantity || 0);
      const reorderPoint = Number(item.reorderPoint || 0);
      const salesLast30Days = Number(item.salesLast30Days || 0);
      const supplierName = item.supplierName || "Supplier";
      const supplierEmail = item.supplierEmail || "";

      const suggestedQuantity = Math.max(
        1,
        Math.ceil((reorderPoint * 2) - currentStock),
        Math.ceil(salesLast30Days / 2),
        10
      );

      let urgency = "normal";
      if (currentStock <= Math.max(1, reorderPoint / 2)) urgency = "urgent";
      else if (currentStock <= reorderPoint) urgency = "high";

      const subject = "Reorder Request - " + item.name;

      const message =
        "Hello " + supplierName + ",\n\n" +
        "NovaOps AI recommends placing a reorder for " + item.name + ".\n\n" +
        "Current Stock: " + currentStock + "\n" +
        "Reorder Point: " + reorderPoint + "\n" +
        "Sales Last 30 Days: " + salesLast30Days + "\n" +
        "Suggested Quantity: " + suggestedQuantity + "\n" +
        "Urgency: " + urgency.toUpperCase() + "\n\n" +
        "Please confirm availability, pricing, and estimated delivery date.\n\n" +
        "Thank you.";

      res.json({
        source: "novaops-supplier-assistant",
        itemId: item.id,
        itemName: item.name,
        supplierName,
        supplierEmail,
        currentStock,
        reorderPoint,
        salesLast30Days,
        suggestedQuantity,
        urgency,
        subject,
        message
      });
    } catch (err) {
      res.status(500).json({
        error: "Supplier ordering assistant failed",
        details: err.message
      });
    }
  });


  app.post("/ai/ask", auth, function(req, res) {
    try {
      const question = String((req.body && req.body.question) || "").trim();
      const q = question.toLowerCase();

      const inventory = selectAll("SELECT * FROM inventory WHERE userId = ?", [req.user.id]);
      const employees = selectAll("SELECT * FROM employees WHERE userId = ?", [req.user.id]);
      const orders = selectAll("SELECT * FROM orders WHERE userId = ? ORDER BY createdAt DESC", [req.user.id]);

      const lowStock = inventory.filter(function(item) {
        return Number(item.quantity || 0) <= Number(item.reorderPoint || 0);
      });

      const criticalStock = inventory.filter(function(item) {
        return Number(item.quantity || 0) <= Math.max(1, Number(item.reorderPoint || 0) / 2);
      });

      const openOrders = orders.filter(function(order) {
        return !["received", "completed", "cancelled"].includes(String(order.status || "").toLowerCase());
      });

      const missingCostItems = inventory.filter(function(item) {
        return Number(item.cost || 0) <= 0;
      });

      const inventoryValue = inventory.reduce(function(sum, item) {
        return sum + Number(item.quantity || 0) * Number(item.cost || 0);
      }, 0);

      const weeklyPayrollEstimate = employees.reduce(function(sum, employee) {
        return sum + Number(employee.payRate || 0) * 40;
      }, 0);

      let healthScore = 100;
      healthScore -= lowStock.length * 10;
      healthScore -= criticalStock.length * 10;
      healthScore -= openOrders.length * 5;
      healthScore -= missingCostItems.length * 3;
      if (inventory.length === 0) healthScore -= 20;
      if (employees.length === 0) healthScore -= 10;
      if (healthScore < 0) healthScore = 0;

      let answer = "";
      const actions = [];

      if (!question) {
        answer = "Ask NovaOps a question about inventory, orders, payroll, risks, or what to do today.";
      } else if (q.includes("reorder") || q.includes("stock") || q.includes("inventory")) {
        if (lowStock.length > 0) {
          answer =
            "You should focus on reordering " +
            lowStock.map(item => item.name).join(", ") +
            ". These items are at or below their reorder points. " +
            criticalStock.length +
            " item(s) are at critical stock levels.";
          actions.push("Open Inventory and use AI Supplier Order Assistant.");
          actions.push("Confirm supplier availability and delivery timing.");
        } else {
          answer = "Inventory appears stable right now. No items are currently below reorder point.";
          actions.push("Keep monitoring inventory levels daily.");
        }
      } else if (q.includes("order") || q.includes("supplier")) {
        if (openOrders.length > 0) {
          answer =
            "You have " +
            openOrders.length +
            " open order(s). The next best action is to follow up with suppliers and confirm delivery dates.";
          actions.push("Review open orders.");
          actions.push("Update order status after supplier confirmation.");
        } else {
          answer = "There are no open orders requiring attention right now.";
          actions.push("Create orders from low-stock inventory when needed.");
        }
      } else if (q.includes("payroll") || q.includes("employee") || q.includes("labor")) {
        answer =
          "Estimated weekly payroll is $" +
          weeklyPayrollEstimate.toFixed(2) +
          " across " +
          employees.length +
          " employee record(s).";
        if (weeklyPayrollEstimate > inventoryValue && inventoryValue > 0) {
          answer += " Payroll appears high compared with current inventory value, so cash flow should be watched closely.";
          actions.push("Review payroll costs against current sales and inventory value.");
        } else {
          actions.push("Keep employee pay rates and hours updated.");
        }
      } else if (q.includes("risk") || q.includes("health") || q.includes("score")) {
        answer =
          "Your Business Health Score is " +
          healthScore +
          "/100. Main risk drivers are " +
          lowStock.length +
          " low-stock item(s), " +
          openOrders.length +
          " open order(s), and " +
          missingCostItems.length +
          " item(s) missing cost data.";
        if (lowStock.length > 0) actions.push("Reorder low-stock items.");
        if (openOrders.length > 0) actions.push("Follow up on open orders.");
        if (missingCostItems.length > 0) actions.push("Add missing cost values to inventory.");
      } else if (q.includes("today") || q.includes("do next") || q.includes("what should")) {
        answer =
          "Today, your top priority should be " +
          (criticalStock.length > 0
            ? "preventing stockouts by reordering critical inventory."
            : lowStock.length > 0
              ? "reordering low-stock items."
              : openOrders.length > 0
                ? "following up on open supplier orders."
                : "monitoring operations and keeping data updated.");
        if (criticalStock.length > 0) actions.push("Reorder " + criticalStock.map(item => item.name).join(", ") + ".");
        else if (lowStock.length > 0) actions.push("Reorder " + lowStock.map(item => item.name).join(", ") + ".");
        if (openOrders.length > 0) actions.push("Follow up on " + openOrders.length + " open order(s).");
      } else {
        answer =
          "Here is the current NovaOps snapshot: Health Score " +
          healthScore +
          "/100, " +
          inventory.length +
          " inventory item(s), " +
          lowStock.length +
          " low-stock item(s), " +
          openOrders.length +
          " open order(s), $" +
          inventoryValue.toFixed(2) +
          " inventory value, and $" +
          weeklyPayrollEstimate.toFixed(2) +
          " estimated weekly payroll.";
        actions.push("Ask about inventory, orders, payroll, risks, or what to do today.");
      }

      res.json({
        source: "ask-novaops-local-ai",
        question,
        answer,
        actions,
        metrics: {
          healthScore,
          inventoryItems: inventory.length,
          lowStockItems: lowStock.length,
          criticalStockItems: criticalStock.length,
          openOrders: openOrders.length,
          employees: employees.length,
          inventoryValue,
          weeklyPayrollEstimate,
          missingCostItems: missingCostItems.length
        }
      });
    } catch (err) {
      res.status(500).json({
        error: "Ask NovaOps failed",
        details: err.message
      });
    }
  });


  app.get("/ai/command-center", auth, function(req, res) {
    try {
      const inventory = selectAll("SELECT * FROM inventory WHERE userId = ?", [req.user.id]);
      const employees = selectAll("SELECT * FROM employees WHERE userId = ?", [req.user.id]);
      const orders = selectAll("SELECT * FROM orders WHERE userId = ? ORDER BY createdAt DESC", [req.user.id]);

      const lowStock = inventory.filter(item => Number(item.quantity || 0) <= Number(item.reorderPoint || 0));
      const criticalStock = inventory.filter(item => Number(item.quantity || 0) <= Math.max(1, Number(item.reorderPoint || 0) / 2));
      const openOrders = orders.filter(order => !["received", "completed", "cancelled"].includes(String(order.status || "").toLowerCase()));
      const missingCostItems = inventory.filter(item => Number(item.cost || 0) <= 0);

      const inventoryValue = inventory.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.cost || 0), 0);
      const weeklyPayrollEstimate = employees.reduce((sum, employee) => sum + Number(employee.payRate || 0) * 40, 0);

      let healthScore = 100;
      healthScore -= criticalStock.length * 15;
      healthScore -= lowStock.length * 8;
      healthScore -= openOrders.length * 5;
      healthScore -= missingCostItems.length * 3;
      if (inventory.length === 0) healthScore -= 20;
      if (employees.length === 0) healthScore -= 10;
      if (healthScore < 0) healthScore = 0;

      const cards = [];

      if (criticalStock.length > 0) {
        cards.push({
          status: "red",
          title: "Critical Stock Risk",
          summary: criticalStock.length + " item(s) are at critical stock levels.",
          action: "Generate supplier order",
          target: "inventory"
        });
      }

      if (lowStock.length > 0) {
        cards.push({
          status: "yellow",
          title: "Low Inventory",
          summary: lowStock.length + " item(s) need reorder attention.",
          action: "Review reorder recommendations",
          target: "inventory"
        });
      }

      if (openOrders.length > 0) {
        cards.push({
          status: "yellow",
          title: "Open Orders",
          summary: openOrders.length + " open order(s) need supplier follow-up.",
          action: "Review open orders",
          target: "orders"
        });
      }

      if (missingCostItems.length > 0) {
        cards.push({
          status: "yellow",
          title: "Missing Cost Data",
          summary: missingCostItems.length + " inventory item(s) are missing cost values.",
          action: "Update item costs",
          target: "inventory"
        });
      }

      if (cards.length === 0) {
        cards.push({
          status: "green",
          title: "Operations Stable",
          summary: "No urgent operational issues detected.",
          action: "Continue monitoring",
          target: "dashboard"
        });
      }

      const commandBriefing =
        "AI Command Center: Health Score " + healthScore + "/100. " +
        "Priority focus: " + cards[0].title + ". " +
        "Inventory value is $" + inventoryValue.toFixed(2) +
        ", estimated weekly payroll is $" + weeklyPayrollEstimate.toFixed(2) +
        ", and there are " + openOrders.length + " open order(s).";

      res.json({
        source: "novaops-command-center",
        healthScore,
        commandBriefing,
        cards: cards.slice(0, 5),
        metrics: {
          inventoryItems: inventory.length,
          lowStockItems: lowStock.length,
          criticalStockItems: criticalStock.length,
          openOrders: openOrders.length,
          employees: employees.length,
          inventoryValue,
          weeklyPayrollEstimate,
          missingCostItems: missingCostItems.length
        }
      });
    } catch (err) {
      res.status(500).json({ error: "Command Center failed", details: err.message });
    }
  });

  app.post("/ai/what-if", auth, function(req, res) {
    try {
      const type = String((req.body && req.body.type) || "inventory_increase");
      const amount = Number((req.body && req.body.amount) || 10);

      const inventory = selectAll("SELECT * FROM inventory WHERE userId = ?", [req.user.id]);
      const employees = selectAll("SELECT * FROM employees WHERE userId = ?", [req.user.id]);
      const orders = selectAll("SELECT * FROM orders WHERE userId = ? ORDER BY createdAt DESC", [req.user.id]);

      const inventoryValue = inventory.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.cost || 0), 0);
      const weeklyPayrollEstimate = employees.reduce((sum, employee) => sum + Number(employee.payRate || 0) * 40, 0);
      const openOrders = orders.filter(order => !["received", "completed", "cancelled"].includes(String(order.status || "").toLowerCase()));
      const lowStock = inventory.filter(item => Number(item.quantity || 0) <= Number(item.reorderPoint || 0));

      let title = "";
      let summary = "";
      let impact = [];

      if (type === "inventory_increase") {
        const addedValue = inventoryValue * (amount / 100);
        title = "What if inventory increases by " + amount + "%?";
        summary = "Estimated inventory value would increase by $" + addedValue.toFixed(2) + ". This may reduce stockout risk but requires more cash tied up in inventory.";
        impact.push("Inventory value estimate: $" + (inventoryValue + addedValue).toFixed(2));
        impact.push("Stockout risk may decrease if increases target low-stock items.");
        impact.push("Cash available may decrease by approximately $" + addedValue.toFixed(2) + ".");
      } else if (type === "sales_drop") {
        const riskValue = inventoryValue * (amount / 100);
        title = "What if sales drop by " + amount + "%?";
        summary = "A sales drop could increase inventory holding pressure and slow cash recovery.";
        impact.push("Potential slow-moving inventory exposure: $" + riskValue.toFixed(2));
        impact.push("Open orders should be reviewed before placing new supplier orders.");
        impact.push("Current open orders: " + openOrders.length);
      } else if (type === "hire_employee") {
        const addedPayroll = amount * 40;
        title = "What if another employee is hired at $" + amount + "/hour?";
        summary = "Estimated weekly payroll would increase by $" + addedPayroll.toFixed(2) + ".";
        impact.push("Current weekly payroll estimate: $" + weeklyPayrollEstimate.toFixed(2));
        impact.push("New weekly payroll estimate: $" + (weeklyPayrollEstimate + addedPayroll).toFixed(2));
        impact.push("Review whether revenue and workload justify the added labor cost.");
      } else {
        title = "What-if simulation";
        summary = "NovaOps can simulate inventory increases, sales drops, and hiring decisions.";
        impact.push("Try inventory increase, sales drop, or hire employee.");
      }

      res.json({
        source: "novaops-what-if",
        type,
        amount,
        title,
        summary,
        impact,
        context: {
          inventoryValue,
          weeklyPayrollEstimate,
          openOrders: openOrders.length,
          lowStockItems: lowStock.length
        }
      });
    } catch (err) {
      res.status(500).json({ error: "What-if simulator failed", details: err.message });
    }
  });

  app.get("/ai/forecast", auth, function(req, res) {
    try {
      const inventory = selectAll("SELECT * FROM inventory WHERE userId = ?", [req.user.id]);
      const employees = selectAll("SELECT * FROM employees WHERE userId = ?", [req.user.id]);
      const orders = selectAll("SELECT * FROM orders WHERE userId = ? ORDER BY createdAt DESC", [req.user.id]);

      const forecasts = inventory.map(function(item) {
        const dailySales = Number(item.salesLast30Days || 0) / 30;
        const quantity = Number(item.quantity || 0);
        const reorderPoint = Number(item.reorderPoint || 0);

        let daysUntilStockout = null;
        if (dailySales > 0) {
          daysUntilStockout = Math.max(0, Math.floor(quantity / dailySales));
        }

        let risk = "low";
        if (daysUntilStockout !== null && daysUntilStockout <= 7) risk = "high";
        else if (quantity <= reorderPoint) risk = "medium";

        return {
          itemId: item.id,
          itemName: item.name,
          quantity,
          reorderPoint,
          salesLast30Days: Number(item.salesLast30Days || 0),
          estimatedDaysUntilStockout: daysUntilStockout,
          stockoutRisk: risk
        };
      });

      const highRiskItems = forecasts.filter(item => item.stockoutRisk === "high");
      const mediumRiskItems = forecasts.filter(item => item.stockoutRisk === "medium");

      const weeklyPayrollEstimate = employees.reduce((sum, employee) => sum + Number(employee.payRate || 0) * 40, 0);
      const openOrders = orders.filter(order => !["received", "completed", "cancelled"].includes(String(order.status || "").toLowerCase()));

      const summary =
        "Forecast: " + highRiskItems.length + " high-risk stockout item(s), " +
        mediumRiskItems.length + " medium-risk item(s), " +
        openOrders.length + " open order(s), and estimated weekly payroll of $" +
        weeklyPayrollEstimate.toFixed(2) + ".";

      res.json({
        source: "novaops-forecast",
        summary,
        forecasts,
        metrics: {
          highRiskStockouts: highRiskItems.length,
          mediumRiskStockouts: mediumRiskItems.length,
          openOrders: openOrders.length,
          weeklyPayrollEstimate
        }
      });
    } catch (err) {
      res.status(500).json({ error: "Forecast failed", details: err.message });
    }
  });


  app.post("/ai/learning-events", auth, function(req, res) {
    try {
      db.run("CREATE TABLE IF NOT EXISTS ai_learning_events (id TEXT PRIMARY KEY, userId TEXT, recommendationType TEXT, recommendationTitle TEXT, actionTaken TEXT, outcome TEXT, impactScore REAL, createdAt TEXT)");

      const recommendationType = String(req.body.recommendationType || "general");
      const recommendationTitle = String(req.body.recommendationTitle || "NovaOps recommendation");
      const actionTaken = String(req.body.actionTaken || "reviewed");
      const outcome = String(req.body.outcome || "unknown");

      let impactScore = 0;

      if (["completed", "stockout_avoided", "cost_saved", "risk_reduced", "order_created"].includes(outcome)) {
        impactScore = 10;
      } else if (["reviewed", "pending", "partial"].includes(outcome)) {
        impactScore = 4;
      } else if (["ignored", "no_action", "late"].includes(outcome)) {
        impactScore = -3;
      }

      const event = {
        id: uuid(),
        userId: req.user.id,
        recommendationType,
        recommendationTitle,
        actionTaken,
        outcome,
        impactScore,
        createdAt: new Date().toISOString()
      };

      execute(
        "INSERT INTO ai_learning_events (id,userId,recommendationType,recommendationTitle,actionTaken,outcome,impactScore,createdAt) VALUES (?,?,?,?,?,?,?,?)",
        [event.id, event.userId, event.recommendationType, event.recommendationTitle, event.actionTaken, event.outcome, event.impactScore, event.createdAt]
      );

      saveDb();

      res.json({
        source: "novaops-self-learning",
        message: "Learning event recorded.",
        event
      });
    } catch (err) {
      res.status(500).json({
        error: "Learning event failed",
        details: err.message
      });
    }
  });

  app.get("/ai/learning-insights", auth, function(req, res) {
    try {
      db.run("CREATE TABLE IF NOT EXISTS ai_learning_events (id TEXT PRIMARY KEY, userId TEXT, recommendationType TEXT, recommendationTitle TEXT, actionTaken TEXT, outcome TEXT, impactScore REAL, createdAt TEXT)");

      const events = selectAll(
        "SELECT * FROM ai_learning_events WHERE userId = ? ORDER BY createdAt DESC",
        [req.user.id]
      );

      const totalEvents = events.length;
      const positiveEvents = events.filter(event => Number(event.impactScore || 0) > 0);
      const neutralEvents = events.filter(event => Number(event.impactScore || 0) === 0);
      const negativeEvents = events.filter(event => Number(event.impactScore || 0) < 0);

      const learningScore = totalEvents === 0
        ? 0
        : Math.round((positiveEvents.length / totalEvents) * 100);

      const typeStats = {};

      events.forEach(function(event) {
        const type = event.recommendationType || "general";
        if (!typeStats[type]) {
          typeStats[type] = {
            type,
            count: 0,
            impactScore: 0
          };
        }

        typeStats[type].count += 1;
        typeStats[type].impactScore += Number(event.impactScore || 0);
      });

      const patterns = Object.values(typeStats)
        .sort((a, b) => b.impactScore - a.impactScore)
        .slice(0, 5)
        .map(function(item) {
          return {
            type: item.type,
            count: item.count,
            impactScore: item.impactScore,
            insight: item.impactScore > 0
              ? "Recommendations in this category are producing positive outcomes."
              : "Recommendations in this category need more follow-through or better data."
          };
        });

      let summary = "NovaOps is ready to learn from your actions. Record outcomes when you follow AI recommendations.";

      if (totalEvents > 0) {
        summary =
          "NovaOps has learned from " +
          totalEvents +
          " decision event(s). Positive outcome rate is " +
          learningScore +
          "%. " +
          positiveEvents.length +
          " event(s) improved operations, " +
          neutralEvents.length +
          " were neutral, and " +
          negativeEvents.length +
          " need follow-up.";
      }

      const nextBestLearningAction = totalEvents === 0
        ? "Record your first AI recommendation outcome."
        : negativeEvents.length > 0
          ? "Review recommendations that were ignored or completed late."
          : "Keep recording outcomes so NovaOps can improve future recommendations.";

      res.json({
        source: "novaops-self-learning",
        summary,
        learningScore,
        totalEvents,
        positiveEvents: positiveEvents.length,
        neutralEvents: neutralEvents.length,
        negativeEvents: negativeEvents.length,
        patterns,
        nextBestLearningAction,
        recentEvents: events.slice(0, 10)
      });
    } catch (err) {
      res.status(500).json({
        error: "Learning insights failed",
        details: err.message
      });
    }
  });


  app.get("/ai/ceo-briefing", auth, function(req, res) {
    try {
      const inventory = selectAll("SELECT * FROM inventory WHERE userId = ?", [req.user.id]);
      const employees = selectAll("SELECT * FROM employees WHERE userId = ?", [req.user.id]);
      const orders = selectAll("SELECT * FROM orders WHERE userId = ? ORDER BY createdAt DESC", [req.user.id]);

      const lowStock = inventory.filter(function(item) {
        return Number(item.quantity || 0) <= Number(item.reorderPoint || 0);
      });

      const criticalStock = inventory.filter(function(item) {
        return Number(item.quantity || 0) <= Math.max(1, Number(item.reorderPoint || 0) / 2);
      });

      const openOrders = orders.filter(function(order) {
        return !["received", "completed", "cancelled"].includes(String(order.status || "").toLowerCase());
      });

      const missingCostItems = inventory.filter(function(item) {
        return Number(item.cost || 0) <= 0;
      });

      const inventoryValue = inventory.reduce(function(sum, item) {
        return sum + Number(item.quantity || 0) * Number(item.cost || 0);
      }, 0);

      const weeklyPayrollEstimate = employees.reduce(function(sum, employee) {
        return sum + Number(employee.payRate || 0) * 40;
      }, 0);

      let healthScore = 100;
      healthScore -= criticalStock.length * 15;
      healthScore -= lowStock.length * 8;
      healthScore -= openOrders.length * 5;
      healthScore -= missingCostItems.length * 3;

      if (inventory.length === 0) healthScore -= 20;
      if (employees.length === 0) healthScore -= 10;
      if (healthScore < 0) healthScore = 0;

      const priorities = [];

      if (criticalStock.length > 0) {
        priorities.push({
          level: "urgent",
          title: "Prevent stockouts",
          detail: "Reorder " + criticalStock.map(item => item.name).join(", ") + " immediately."
        });
      }

      if (lowStock.length > 0) {
        priorities.push({
          level: "high",
          title: "Reorder low-stock inventory",
          detail: lowStock.length + " item(s) are at or below reorder point."
        });
      }

      if (openOrders.length > 0) {
        priorities.push({
          level: "medium",
          title: "Follow up on open orders",
          detail: openOrders.length + " open order(s) need supplier follow-up."
        });
      }

      if (missingCostItems.length > 0) {
        priorities.push({
          level: "medium",
          title: "Improve inventory cost data",
          detail: missingCostItems.length + " item(s) need cost values for better profit tracking."
        });
      }

      if (priorities.length === 0) {
        priorities.push({
          level: "normal",
          title: "Operations are stable",
          detail: "No urgent action is required today."
        });
      }

      let biggestRisk = "No major operational risk detected.";

      if (criticalStock.length > 0) {
        biggestRisk = "Critical stockout risk on " + criticalStock.map(item => item.name).join(", ") + ".";
      } else if (lowStock.length > 0) {
        biggestRisk = "Low inventory risk on " + lowStock.map(item => item.name).join(", ") + ".";
      } else if (openOrders.length > 0) {
        biggestRisk = "Supplier follow-up risk because " + openOrders.length + " order(s) remain open.";
      } else if (missingCostItems.length > 0) {
        biggestRisk = "Data quality risk because inventory cost values are missing.";
      }

      const greeting =
        "Good morning. NovaOps AI has reviewed your business operations.";

      const briefing =
        greeting + " Business Health Score is " + healthScore + "/100. " +
        "Today's top focus is: " + priorities[0].title + ". " +
        "Biggest risk: " + biggestRisk + " " +
        "Inventory value is $" + inventoryValue.toFixed(2) + 
        ", estimated weekly payroll is $" + weeklyPayrollEstimate.toFixed(2) + 
        ", and there are " + openOrders.length + " open order(s).";

      res.json({
        source: "novaops-ceo-briefing",
        healthScore,
        greeting,
        briefing,
        biggestRisk,
        priorities: priorities.slice(0, 5),
        metrics: {
          inventoryItems: inventory.length,
          lowStockItems: lowStock.length,
          criticalStockItems: criticalStock.length,
          openOrders: openOrders.length,
          employees: employees.length,
          inventoryValue,
          weeklyPayrollEstimate,
          missingCostItems: missingCostItems.length
        }
      });
    } catch (err) {
      res.status(500).json({
        error: "CEO briefing failed",
        details: err.message
      });
    }
  });


  app.get("/appointments", auth, function(req, res) {
    try {
      const rows = selectAll("SELECT * FROM appointments WHERE userId = ? ORDER BY appointmentDate ASC, appointmentTime ASC", [req.user.id]);
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: "Appointments failed", details: err.message });
    }
  });

  app.post("/appointments", auth, function(req, res) {
    try {
      const item = {
        id: uuid(),
        userId: req.user.id,
        customerName: req.body.customerName || "Customer",
        appointmentDate: req.body.appointmentDate || "",
        appointmentTime: req.body.appointmentTime || "",
        location: req.body.location || "",
        status: req.body.status || "scheduled",
        notes: req.body.notes || "",
        createdAt: new Date().toISOString()
      };

      execute(
        "INSERT INTO appointments (id,userId,customerName,appointmentDate,appointmentTime,location,status,notes,createdAt) VALUES (?,?,?,?,?,?,?,?,?)",
        [item.id,item.userId,item.customerName,item.appointmentDate,item.appointmentTime,item.location,item.status,item.notes,item.createdAt]
      );

      saveDb();
      res.json(item);
    } catch (err) {
      res.status(500).json({ error: "Add appointment failed", details: err.message });
    }
  });

  app.get("/tasks", auth, function(req, res) {
    try {
      const rows = selectAll("SELECT * FROM tasks WHERE userId = ? ORDER BY dueDate ASC", [req.user.id]);
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: "Tasks failed", details: err.message });
    }
  });

  app.post("/tasks", auth, function(req, res) {
    try {
      const item = {
        id: uuid(),
        userId: req.user.id,
        title: req.body.title || "New task",
        assignedTo: req.body.assignedTo || "",
        priority: req.body.priority || "medium",
        dueDate: req.body.dueDate || "",
        status: req.body.status || "open",
        notes: req.body.notes || "",
        createdAt: new Date().toISOString()
      };

      execute(
        "INSERT INTO tasks (id,userId,title,assignedTo,priority,dueDate,status,notes,createdAt) VALUES (?,?,?,?,?,?,?,?,?)",
        [item.id,item.userId,item.title,item.assignedTo,item.priority,item.dueDate,item.status,item.notes,item.createdAt]
      );

      saveDb();
      res.json(item);
    } catch (err) {
      res.status(500).json({ error: "Add task failed", details: err.message });
    }
  });

  app.get("/vehicles", auth, function(req, res) {
    try {
      const rows = selectAll("SELECT * FROM vehicles WHERE userId = ? ORDER BY createdAt DESC", [req.user.id]);
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: "Vehicles failed", details: err.message });
    }
  });

  app.post("/vehicles", auth, function(req, res) {
    try {
      const item = {
        id: uuid(),
        userId: req.user.id,
        name: req.body.name || "Vehicle",
        vin: req.body.vin || "",
        mileage: Number(req.body.mileage || 0),
        insuranceExpiration: req.body.insuranceExpiration || "",
        registrationExpiration: req.body.registrationExpiration || "",
        maintenanceDue: req.body.maintenanceDue || "",
        status: req.body.status || "active",
        notes: req.body.notes || "",
        createdAt: new Date().toISOString()
      };

      execute(
        "INSERT INTO vehicles (id,userId,name,vin,mileage,insuranceExpiration,registrationExpiration,maintenanceDue,status,notes,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        [item.id,item.userId,item.name,item.vin,item.mileage,item.insuranceExpiration,item.registrationExpiration,item.maintenanceDue,item.status,item.notes,item.createdAt]
      );

      saveDb();
      res.json(item);
    } catch (err) {
      res.status(500).json({ error: "Add vehicle failed", details: err.message });
    }
  });

  app.get("/ai/business-os-briefing", auth, function(req, res) {
    try {
      const appointments = selectAll("SELECT * FROM appointments WHERE userId = ? ORDER BY appointmentDate ASC, appointmentTime ASC", [req.user.id]);
      const tasks = selectAll("SELECT * FROM tasks WHERE userId = ? ORDER BY dueDate ASC", [req.user.id]);
      const vehicles = selectAll("SELECT * FROM vehicles WHERE userId = ? ORDER BY createdAt DESC", [req.user.id]);

      const openTasks = tasks.filter(task => !["done", "completed", "cancelled"].includes(String(task.status || "").toLowerCase()));
      const highPriorityTasks = openTasks.filter(task => String(task.priority || "").toLowerCase() === "high" || String(task.priority || "").toLowerCase() === "urgent");
      const scheduledAppointments = appointments.filter(appt => !["done", "completed", "cancelled"].includes(String(appt.status || "").toLowerCase()));
      const vehicleAlerts = vehicles.filter(vehicle => String(vehicle.status || "").toLowerCase() !== "inactive" && (vehicle.maintenanceDue || vehicle.insuranceExpiration || vehicle.registrationExpiration));

      const actions = [];

      if (scheduledAppointments.length > 0) {
        actions.push("Review " + scheduledAppointments.length + " scheduled appointment(s).");
      }

      if (highPriorityTasks.length > 0) {
        actions.push("Complete " + highPriorityTasks.length + " high-priority task(s).");
      } else if (openTasks.length > 0) {
        actions.push("Review " + openTasks.length + " open task(s).");
      }

      if (vehicleAlerts.length > 0) {
        actions.push("Check " + vehicleAlerts.length + " vehicle record(s) for maintenance, insurance, or registration updates.");
      }

      if (actions.length === 0) {
        actions.push("Business OS looks stable. Keep appointments, tasks, and vehicles updated.");
      }

      const summary =
        "Business OS Briefing: " +
        scheduledAppointments.length + " scheduled appointment(s), " +
        openTasks.length + " open task(s), " +
        vehicles.length + " vehicle record(s). " +
        "Top action: " + actions[0];

      res.json({
        source: "novaops-business-os",
        summary,
        actions,
        metrics: {
          appointments: appointments.length,
          scheduledAppointments: scheduledAppointments.length,
          tasks: tasks.length,
          openTasks: openTasks.length,
          highPriorityTasks: highPriorityTasks.length,
          vehicles: vehicles.length,
          vehicleAlerts: vehicleAlerts.length
        },
        appointments: appointments.slice(0, 5),
        tasks: tasks.slice(0, 5),
        vehicles: vehicles.slice(0, 5)
      });
    } catch (err) {
      res.status(500).json({ error: "Business OS briefing failed", details: err.message });
    }
  });

  app.get("/ai/autopilot", auth, function(req, res) {
    try {
      const inventory = selectAll("SELECT * FROM inventory WHERE userId = ?", [req.user.id]);
      const employees = selectAll("SELECT * FROM employees WHERE userId = ?", [req.user.id]);
      const orders = selectAll("SELECT * FROM orders WHERE userId = ? ORDER BY createdAt DESC", [req.user.id]);

      const lowStock = inventory.filter(function(item) {
        return Number(item.quantity || 0) <= Number(item.reorderPoint || 0);
      });

      const criticalStock = inventory.filter(function(item) {
        return Number(item.quantity || 0) <= Math.max(1, Number(item.reorderPoint || 0) / 2);
      });

      const openOrders = orders.filter(function(order) {
        return !["received", "completed", "cancelled"].includes(String(order.status || "").toLowerCase());
      });

      const missingCostItems = inventory.filter(function(item) {
        return Number(item.cost || 0) <= 0;
      });

      const inventoryValue = inventory.reduce(function(sum, item) {
        return sum + Number(item.quantity || 0) * Number(item.cost || 0);
      }, 0);

      const weeklyPayrollEstimate = employees.reduce(function(sum, employee) {
        return sum + Number(employee.payRate || 0) * 40;
      }, 0);

      let healthScore = 100;
      healthScore -= lowStock.length * 10;
      healthScore -= criticalStock.length * 10;
      healthScore -= openOrders.length * 5;
      healthScore -= missingCostItems.length * 3;

      if (inventory.length === 0) healthScore -= 20;
      if (employees.length === 0) healthScore -= 10;
      if (healthScore < 0) healthScore = 0;

      const priorityActions = [];

      if (criticalStock.length > 0) {
        priorityActions.push({
          priority: "urgent",
          title: "Prevent stockouts",
          action: "Reorder " + criticalStock.map(item => item.name).join(", ") + " immediately.",
          reason: "These items are at or below critical stock levels."
        });
      }

      if (lowStock.length > 0) {
        priorityActions.push({
          priority: "high",
          title: "Reorder low-stock inventory",
          action: "Create supplier orders for " + lowStock.map(item => item.name).join(", ") + ".",
          reason: "These items are at or below their reorder points."
        });
      }

      if (openOrders.length > 0) {
        priorityActions.push({
          priority: "medium",
          title: "Follow up on open orders",
          action: "Review " + openOrders.length + " open order(s) and confirm supplier status.",
          reason: "Open orders can delay inventory recovery if they are not tracked."
        });
      }

      if (missingCostItems.length > 0) {
        priorityActions.push({
          priority: "medium",
          title: "Improve inventory data quality",
          action: "Add cost values to " + missingCostItems.length + " inventory item(s).",
          reason: "Missing cost data makes profit and inventory value less accurate."
        });
      }

      if (priorityActions.length === 0) {
        priorityActions.push({
          priority: "normal",
          title: "Operations look stable",
          action: "Keep monitoring inventory, orders, and payroll every day.",
          reason: "No urgent operational risks were detected."
        });
      }

      const risks = [];

      risks.push({
        name: "Stockout Risk",
        level: criticalStock.length > 0 ? "High" : lowStock.length > 0 ? "Medium" : "Low"
      });

      risks.push({
        name: "Supplier Delay Risk",
        level: openOrders.length >= 3 ? "High" : openOrders.length > 0 ? "Medium" : "Low"
      });

      risks.push({
        name: "Payroll Pressure",
        level: weeklyPayrollEstimate > inventoryValue && inventoryValue > 0 ? "Medium" : "Low"
      });

      risks.push({
        name: "Data Quality Risk",
        level: missingCostItems.length > 0 ? "Medium" : "Low"
      });

      const briefing =
        "NovaOps Autopilot: Business Health Score is " + healthScore + "/100. " +
        "Today, focus on " + priorityActions[0].title.toLowerCase() + ". " +
        lowStock.length + " low-stock item(s), " +
        openOrders.length + " open order(s), $" +
        inventoryValue.toFixed(2) + " inventory value, and estimated weekly payroll of $" +
        weeklyPayrollEstimate.toFixed(2) + ".";

      res.json({
        source: "novaops-autopilot",
        healthScore,
        briefing,
        priorityActions: priorityActions.slice(0, 3),
        risks,
        metrics: {
          inventoryItems: inventory.length,
          lowStockItems: lowStock.length,
          criticalStockItems: criticalStock.length,
          openOrders: openOrders.length,
          employees: employees.length,
          inventoryValue,
          weeklyPayrollEstimate,
          missingCostItems: missingCostItems.length
        }
      });
    } catch (err) {
      res.status(500).json({
        error: "Autopilot failed",
        details: err.message
      });
    }
  });

  app.get("/ai/recommendations", auth, function(req, res) {
    const items = selectAll("SELECT * FROM inventory WHERE userId = ?", [req.user.id]);

    const recommendations = items.map(function(item) {
      const dailySales = Number(item.salesLast30Days || 0) / 30;
      const daysLeft = dailySales > 0 ? Math.round(Number(item.quantity) / dailySales) : null;

      let suggestion = "Stock level looks okay.";
      let priority = "low";

      if (Number(item.quantity) <= Number(item.reorderPoint)) {
        suggestion = "Reorder soon. Stock is at or below your reorder point.";
        priority = "high";
      } else if (daysLeft !== null && daysLeft <= 14) {
        suggestion = "Consider reordering. Based on recent sales, this may run low within 2 weeks.";
        priority = "medium";
      }

      return {
        itemId: item.id,
        itemName: item.name,
        quantity: item.quantity,
        reorderPoint: item.reorderPoint,
        salesLast30Days: item.salesLast30Days,
        estimatedDaysLeft: daysLeft,
        priority,
        suggestion
      };
    });

    res.json(recommendations);
  });

  app.get("/ai/executive-summary", auth, async function(req, res) {
    try {
      const inventory = selectAll("SELECT * FROM inventory WHERE userId = ?", [req.user.id]);
      const employees = selectAll("SELECT * FROM employees WHERE userId = ?", [req.user.id]);
      const orders = selectAll("SELECT * FROM orders WHERE userId = ? ORDER BY createdAt DESC", [req.user.id]);

      const lowStock = inventory.filter(function(item) {
        return Number(item.quantity || 0) <= Number(item.reorderPoint || 0);
      });

      const openOrders = orders.filter(function(order) {
        return !["received", "completed", "cancelled"].includes(String(order.status || "").toLowerCase());
      });

      const inventoryValue = inventory.reduce(function(sum, item) {
        return sum + Number(item.quantity || 0) * Number(item.cost || 0);
      }, 0);

      const weeklyPayrollEstimate = employees.reduce(function(sum, employee) {
        return sum + Number(employee.payRate || 0) * 40;
      }, 0);

      const fallbackSummary =
        "Business snapshot: " +
        lowStock.length + " low-stock item(s), " +
        openOrders.length + " open order(s), $" +
        inventoryValue.toFixed(2) + " in inventory value, and estimated weekly payroll of $" +
        weeklyPayrollEstimate.toFixed(2) + ".";

      let healthScore = 100;

      healthScore -= lowStock.length * 10;
      healthScore -= openOrders.length * 5;

      if (healthScore < 0) healthScore = 0;

      const recommendations = [];

      if (lowStock.length > 0) {
        recommendations.push(
          "Reorder " +
          lowStock.map(item => item.name).join(", ") +
          " to avoid stock shortages."
        );
      }

      if (openOrders.length > 0) {
        recommendations.push(
          openOrders.length +
          " open order(s) require follow-up and supplier tracking."
        );
      }

      if (weeklyPayrollEstimate > inventoryValue && inventoryValue > 0) {
        recommendations.push(
          "Payroll costs are higher than inventory value. Monitor cash flow carefully."
        );
      }

      if (recommendations.length === 0) {
        recommendations.push(
          "Operations look healthy. Continue monitoring inventory and employee performance."
        );
      }

      const summary =
        "Business Health Score: " + healthScore + "/100. " +
        "Inventory items: " + inventory.length + ". " +
        lowStock.length + " low-stock item(s). " +
        openOrders.length + " open order(s). " +
        "Inventory value: $" + inventoryValue.toFixed(2) + ". " +
        "Estimated weekly payroll: $" + weeklyPayrollEstimate.toFixed(2) + ". " +
        "Recommended actions: " + recommendations.join(" ");

      res.json({
        source: "novaops-local-ai",
        summary
      });
    } catch (err) {
      res.status(500).json({
        error: "Executive summary failed",
        details: err.message
      });
    }
  });

  app.get("/admin/ai-actions", auth, function(req, res) {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Admin only" });
    }

    const count = selectOne(
      "SELECT COUNT(*) AS count FROM ai_actions",
      []
    );

    if (Number(count.count) === 0) {
      execute(
        "INSERT INTO ai_actions (id,type,title,description,status,createdAt) VALUES (?,?,?,?,?,?)",
        [uuid(), "security", "Check outdated packages", "AI recommends reviewing dependency updates.", "needs_approval", new Date().toISOString()]
      );

      execute(
        "INSERT INTO ai_actions (id,type,title,description,status,createdAt) VALUES (?,?,?,?,?,?)",
        [uuid(), "backup", "SQLite database active", "Data is saved in server/novaops.sqlite.", "info", new Date().toISOString()]
      );

      execute(
        "INSERT INTO ai_actions (id,type,title,description,status,createdAt) VALUES (?,?,?,?,?,?)",
        [uuid(), "quality", "Add tests", "AI recommends tests for login, payroll, inventory, Stripe, and AI.", "needs_approval", new Date().toISOString()]
      );
    }

    res.json(
      selectAll(
        "SELECT * FROM ai_actions ORDER BY createdAt DESC",
        []
      )
    );
  });

  app.put("/admin/ai-actions/:id", auth, function(req, res) {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Admin only" });
    }

    execute(
      "UPDATE ai_actions SET status = ? WHERE id = ?",
      [req.body.status, req.params.id]
    );

    res.json(
      selectOne(
        "SELECT * FROM ai_actions WHERE id = ?",
        [req.params.id]
      )
    );
  });

  app.post("/stripe/create-checkout-session", auth, async function(req, res) {
    try {
      if (!stripe) {
        return res.status(500).json({ error: "Stripe is not configured yet." });
      }

      if (!process.env.STRIPE_PRICE_ID) {
        return res.status(500).json({ error: "Stripe price ID is missing." });
      }

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        payment_method_types: ["card"],
        line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
        success_url: "https://novaops-ai-app.onrender.com/stripe/success?session_id={CHECKOUT_SESSION_ID}",
        cancel_url: "https://novaops-ai-app.onrender.com/stripe/cancel",
        metadata: { userId: req.user.id }
      });

      res.json({ url: session.url });
    } catch (err) {
      console.error("STRIPE CHECKOUT ERROR:", err);
      res.status(500).json({ error: "Stripe checkout failed", details: err.message });
    }
  });



  app.get("/stripe/success", async function(req, res) {
    try {
      if (!stripe) return res.status(500).send("Stripe is not configured.");

      const sessionId = req.query.session_id;
      if (!sessionId) return res.status(400).send("Missing Stripe session ID.");

      const session = await stripe.checkout.sessions.retrieve(sessionId);
      const userId = session.metadata ? session.metadata.userId : null;
      if (!userId) return res.status(400).send("Stripe session missing user ID.");

      if (session.status === "complete" || session.payment_status === "paid") {
        execute("UPDATE users SET plan = ? WHERE id = ?", ["pro", userId]);
        saveDb();

        return res.send(`
          <html>
            <head>
              <meta name="viewport" content="width=device-width, initial-scale=1" />
              <title>NovaOps Pro Active</title>
              <style>
                body { font-family: Arial, sans-serif; padding: 32px; background: #0f172a; color: white; }
                .card { max-width: 520px; margin: 40px auto; background: #111827; padding: 28px; border-radius: 16px; }
                h1 { color: #22c55e; }
                p { color: #d1d5db; line-height: 1.5; }
              </style>
            </head>
            <body>
              <div class="card">
                <h1>NovaOps Pro is active</h1>
                <p>Your Stripe payment was confirmed and your NovaOps account was upgraded to Pro.</p>
                <p>You can close this page and reopen NovaOps.</p>
              </div>
            </body>
          </html>
        `);
      }

      return res.status(400).send("Checkout session is not complete yet.");
    } catch (err) {
      console.error("STRIPE SUCCESS ERROR:", err);
      return res.status(500).send("Stripe success confirmation failed: " + err.message);
    }
  });

  app.get("/stripe/cancel", function(req, res) {
    res.send("Stripe checkout was canceled. You can close this page and return to NovaOps.");
  });

  app.post("/stripe/confirm-checkout", async function(req, res) {
    try {
      if (!stripe) {
        return res.status(500).json({ error: "Stripe is not configured yet." });
      }

      const sessionId = req.body.sessionId;
      if (!sessionId) return res.status(400).json({ error: "Missing Stripe session ID" });

      const session = await stripe.checkout.sessions.retrieve(sessionId);
      const userId = session.metadata ? session.metadata.userId : null;

      if (!userId) return res.status(400).json({ error: "Stripe session missing user ID" });

      if (session.status === "complete" || session.payment_status === "paid") {
        execute("UPDATE users SET plan = ? WHERE id = ?", ["pro", userId]);

        const user = selectOne("SELECT id, email, businessName, plan, role FROM users WHERE id = ?", [userId]);

        return res.json({
          ok: true,
          message: "Payment confirmed. User upgraded to pro.",
          user
        });
      }

      res.status(400).json({
        error: "Checkout session is not complete yet",
        status: session.status,
        payment_status: session.payment_status
      });
    } catch (err) {
      res.status(500).json({ error: "Stripe confirmation failed", details: err.message });
    }
  });

  const PORT = process.env.PORT || 4000;

  app.listen(PORT, "0.0.0.0", function() {
    console.log("NovaOps AI server running on http://0.0.0.0:" + PORT);
    console.log("SQLite database saved at: " + DB_FILE);
  });
}

main();
