
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Stripe = require("stripe");
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
const DB_FILE = path.join(__dirname, "novaops.sqlite");

app.use(cors());
app.use(express.json());

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

    res.json({
      totalInventoryItems,
      lowStockItems,
      totalEmployees,
      monthlyPayrollEstimate: payroll || 0,
      plan: req.user.plan,
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
      createdAt: new Date().toISOString()
    };

    execute(
      "INSERT INTO employees (id, userId, name, role, payType, payRate, performanceScore, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [employee.id, employee.userId, employee.name, employee.role, employee.payType, employee.payRate, employee.performanceScore, employee.createdAt]
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
      performanceScore: req.body.performanceScore !== undefined ? Number(req.body.performanceScore) : Number(employee.performanceScore || 0)
    };

    execute(
      "UPDATE employees SET name = ?, role = ?, payType = ?, payRate = ?, performanceScore = ? WHERE id = ? AND userId = ?",
      [updated.name, updated.role, updated.payType, updated.payRate, updated.performanceScore, req.params.id, req.user.id]
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

  app.get("/admin/ai-actions", auth, function(req, res) {
    if (req.user.role !== "admin") return res.status(403).json({ error: "Admin only" });

    res.json([
      { id: uuid(), type: "security", title: "Check outdated packages", description: "AI recommends reviewing dependency updates.", status: "needs_approval" },
      { id: uuid(), type: "backup", title: "SQLite database active", description: "Data is saved in server/novaops.sqlite.", status: "info" },
      { id: uuid(), type: "quality", title: "Add tests", description: "AI recommends tests for login, payroll, inventory, Stripe, and AI.", status: "needs_approval" }
    ]);
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
        success_url: "http://localhost:8081?checkout=success&session_id={CHECKOUT_SESSION_ID}",
        cancel_url: "http://localhost:8081/cancel",
        metadata: { userId: req.user.id }
      });

      res.json({ url: session.url });
    } catch (err) {
      res.status(500).json({ error: "Stripe checkout failed", details: err.message });
    }
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

  app.listen(PORT, function() {
    console.log("NovaOps AI server running on http://localhost:" + PORT);
    console.log("SQLite database saved at: " + DB_FILE);
  });
}

main();
