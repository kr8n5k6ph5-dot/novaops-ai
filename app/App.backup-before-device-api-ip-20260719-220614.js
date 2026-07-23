import React, { useEffect, useState } from "react";
import { SafeAreaView, ScrollView, View, Text, TextInput, Pressable, StyleSheet, Alert } from "react-native";

const API = "http://localhost:4000";

export default function App() {
  const [token, setToken] = useState("");
  const [user, setUser] = useState(null);
  const [screen, setScreen] = useState("dashboard");
  const [status, setStatus] = useState("Ready");

  const [email, setEmail] = useState("owner@example.com");
  const [password, setPassword] = useState("password123");
  const [businessName, setBusinessName] = useState("My Business");

  const [dashboard, setDashboard] = useState(null);
  const [inventory, setInventory] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [adminActions, setAdminActions] = useState([]);
  const [executiveAiSummary, setExecutiveAiSummary] = useState("");
  const [orders, setOrders] = useState([]);

  const [itemName, setItemName] = useState("Coffee Beans");
  const [quantity, setQuantity] = useState("10");
  const [reorderPoint, setReorderPoint] = useState("5");
  const [salesLast30Days, setSalesLast30Days] = useState("20");

  const [employeeName, setEmployeeName] = useState("John Worker");
  const [payRate, setPayRate] = useState("20");
  const [hours, setHours] = useState("40");

  useEffect(() => {
    checkStripeReturn();
    restoreSavedLogin();
  }, []);

  async function checkStripeReturn() {
    try {
      if (
        typeof window === "undefined" ||
        !window.location ||
        typeof localStorage === "undefined"
      ) return;

      const params = new URLSearchParams(window.location.search);
      const sessionId = params.get("session_id");

      if (!sessionId) return;

      setStatus("Confirming Stripe payment...");

      const res = await fetch(API + "/stripe/confirm-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.details || "Stripe confirmation failed");

      if (data.user) {
        setUser(data.user);

        const savedToken = null;
        if (savedToken) {
          setToken(savedToken);
          
          await loadAll(savedToken);
        }
      }

      setStatus("Stripe payment confirmed. NovaOps AI Pro is active.");

      window.history.replaceState({}, document.title, window.location.pathname);
    } catch (e) {
      setStatus("Stripe confirm error: " + e.message);
    }
  }

  async function restoreSavedLogin() {
    try {
      if (
        typeof window === "undefined" ||
        typeof localStorage === "undefined"
      ) return;

      const savedToken = null;
      const savedUser = null;

      if (savedToken && savedUser) {
        const parsedUser = JSON.parse(savedUser);
        setToken(savedToken);
        setUser(parsedUser);
        await loadAll(savedToken);

        if (parsedUser.role === "admin") {
          await loadAdminActions(savedToken);
        }
      }
    } catch (e) {
      console.log(e.message);
    }
  }


  async function api(path, method = "GET", body, activeToken = token) {
    console.log("CALLING API:", API + path);
    const res = await fetch(API + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: activeToken ? "Bearer " + activeToken : ""
      },
      body: body ? JSON.stringify(body) : undefined
    });

    const raw = await res.text();
    console.log("API STATUS:", res.status, "RAW:", raw.substring(0, 200));

    let data;
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch (e) {
      throw new Error("Server returned HTML instead of JSON: " + raw.substring(0, 80));
    }

    if (!res.ok) throw new Error(data.error || data.details || "Request failed");
    return data;
  }


  async function loadExecutiveSummary() {
    try {
      const data = await api("/ai/executive-summary", "GET");
      setExecutiveAiSummary(data.summary || "");
      setStatus("Executive summary updated.");
    } catch (e) {
      setStatus(e.message);
    }
  }

  function signOut() {
    try {
      if (typeof window !== "undefined") {
        
        
      }

      setToken("");
      setUser(null);
      setDashboard(null);
      setInventory([]);
      setEmployees([]);
      setRecommendations([]);
      setAdminActions([]);
      setOrders([]);
      setScreen("dashboard");
      setStatus("Signed out.");
    } catch (e) {
      setStatus("Sign out error: " + e.message);
    }
  }

  async function loadAll(activeToken = token) {
    try {
      setStatus("Refreshing data...");
      const d = await api("/dashboard", "GET", null, activeToken);
      const inv = await api("/inventory", "GET", null, activeToken);
      const emp = await api("/employees", "GET", null, activeToken);
      const rec = await api("/ai/recommendations", "GET", null, activeToken);
      const ord = await api("/orders", "GET", null, activeToken);

      setDashboard(d);
      setInventory(inv);
      setEmployees(emp);
      setRecommendations(rec);
      setOrders(ord);
      setStatus("Refreshed successfully.");
    } catch (e) {
      setStatus("Error: " + e.message);
    }
  }

  async function loadAdminActions(activeToken = token) {
    try {
      setStatus("Loading Admin AI Dashboard...");
      const actions = await api("/admin/ai-actions", "GET", null, activeToken);
      setAdminActions(actions);
      setStatus("Admin AI Dashboard loaded.");
    } catch (e) {
      setStatus("Admin error: " + e.message);
      Alert.alert("Admin error", e.message);
    }
  }

  async function signup() {
    try {
      setStatus("Creating account...");
      const res = await fetch(API + "/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, businessName })
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setToken(data.token);
      setUser(data.user);
      
      
      await loadAll(data.token);

      if (data.user.role === "admin") {
        await loadAdminActions(data.token);
      }

      setStatus("Account created.");
    } catch (e) {
      setStatus("Signup error: " + e.message);
      Alert.alert("Signup error", e.message);
    }
  }

  async function login() {
    try {
      setStatus("Signing in...");
      const res = await fetch(API + "/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setToken(data.token);
      setUser(data.user);
      
      
      await loadAll(data.token);

      if (data.user.role === "admin") {
        await loadAdminActions(data.token);
      }

      setStatus("Signed in.");
    } catch (e) {
      setStatus("Login error: " + e.message);
      Alert.alert("Login error", e.message);
    }
  }

  async function addInventory() {
    try {
      setStatus("Adding inventory...");
      await api("/inventory", "POST", {
        name: itemName,
        quantity,
        reorderPoint,
        salesLast30Days
      });
      await loadAll();
      setStatus("Inventory added.");
    } catch (e) {
      setStatus("Error: " + e.message);
      Alert.alert("Error", e.message);
    }
  }

  async function editInventory(item) {
    try {
      setStatus("Editing inventory...");
      await api("/inventory/" + item.id, "PUT", {
        name: itemName,
        quantity,
        reorderPoint,
        salesLast30Days
      });
      await loadAll();
      setStatus("Inventory item updated.");
    } catch (e) {
      setStatus("Error: " + e.message);
      Alert.alert("Error", e.message);
    }
  }

  async function deleteInventory(item) {
    try {
      setStatus("Deleting inventory...");
      await api("/inventory/" + item.id, "DELETE");
      await loadAll();
      setStatus("Inventory item deleted.");
    } catch (e) {
      setStatus("Error: " + e.message);
      Alert.alert("Error", e.message);
    }
  }

  async function reorder(item) {
    try {
      const order = await api("/inventory/" + item.id + "/reorder", "POST", {
        quantityOrdered: Number(item.reorderPoint) * 2
      });
      setStatus("Reorder pending approval for " + order.itemName);
      Alert.alert("Reorder created", "Pending approval: " + order.itemName);
    } catch (e) {
      setStatus("Error: " + e.message);
      Alert.alert("Error", e.message);
    }
  }


  async function updateOrderStatus(order, status) {
    try {
      setStatus("Updating order...");
      await api("/orders/" + order.id + "/status", "PUT", { status });
      await loadAll();

      if (status === "received") {
        setStatus("Order received. Inventory quantity was updated.");
      } else {
        setStatus("Order marked as " + status + ".");
      }
    } catch (e) {
      setStatus("Order error: " + e.message);
      Alert.alert("Order error", e.message);
    }
  }

  async function addEmployee() {
    try {
      setStatus("Adding employee...");
      await api("/employees", "POST", {
        name: employeeName,
        payRate,
        payType: "hourly"
      });
      await loadAll();
      setStatus("Employee added.");
    } catch (e) {
      setStatus("Error: " + e.message);
      Alert.alert("Error", e.message);
    }
  }

  async function editEmployee(employee) {
    try {
      setStatus("Editing employee...");
      await api("/employees/" + employee.id, "PUT", {
        name: employeeName,
        payRate,
        payType: "hourly"
      });
      await loadAll();
      setStatus("Employee updated.");
    } catch (e) {
      setStatus("Error: " + e.message);
      Alert.alert("Error", e.message);
    }
  }

  async function deleteEmployee(employee) {
    try {
      setStatus("Deleting employee...");
      await api("/employees/" + employee.id, "DELETE");
      await loadAll();
      setStatus("Employee deleted.");
    } catch (e) {
      setStatus("Error: " + e.message);
      Alert.alert("Error", e.message);
    }
  }

  async function calculatePayroll(employee) {
    try {
      const run = await api("/payroll/calculate", "POST", {
        employeeId: employee.id,
        hours
      });
      setStatus("Payroll calculated. Net pay: $" + run.netPay.toFixed(2));
      Alert.alert("Payroll calculated", "Net pay: $" + run.netPay.toFixed(2));
    } catch (e) {
      setStatus("Error: " + e.message);
      Alert.alert("Error", e.message);
    }
  }


  async function upgradeToPro() {
    try {
      setStatus("Opening Stripe Checkout...");
      const data = await api("/stripe/create-checkout-session", "POST");
      if (data.url) {
        window.location.href = data.url;
      } else {
        setStatus("Stripe did not return a checkout URL.");
      }
    } catch (e) {
      setStatus("Stripe error: " + e.message);
      Alert.alert("Stripe error", e.message);
    }
  }

  async function addDemoData() {
    try {
      setStatus("Adding demo data...");

      await api("/inventory", "POST", {
        name: "Coffee Beans",
        quantity: 3,
        reorderPoint: 5,
        salesLast30Days: 45
      });

      await api("/inventory", "POST", {
        name: "Paper Cups",
        quantity: 25,
        reorderPoint: 10,
        salesLast30Days: 30
      });

      await api("/employees", "POST", {
        name: "John Worker",
        payRate: 20,
        payType: "hourly"
      });

      await loadAll();
      setStatus("Demo data added.");
    } catch (e) {
      setStatus("Error: " + e.message);
    }
  }

  async function approveAdminAction(action) {
    try {
      const updated = await api("/admin/ai-actions/" + action.id, "PUT", {
        status: "approved"
      });

      setAdminActions(current =>
        current.map(item => item.id === action.id ? updated : item)
      );

      setStatus("Approved admin action: " + action.title);
    } catch (e) {
      setStatus(e.message);
    }
  }

  async function rejectAdminAction(action) {
    try {
      const updated = await api("/admin/ai-actions/" + action.id, "PUT", {
        status: "rejected"
      });

      setAdminActions(current =>
        current.map(item => item.id === action.id ? updated : item)
      );

      setStatus("Rejected admin action: " + action.title);
    } catch (e) {
      setStatus(e.message);
    }
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.page}>
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.logo}>NovaOps AI</Text>
          <Text style={styles.tagline}>Your AI business command center</Text>

          <View style={styles.statusBox}>
            <Text style={styles.statusText}>{status}</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.title}>Create or sign in</Text>

            <TextInput style={styles.input} value={businessName} onChangeText={setBusinessName} placeholder="Business name" placeholderTextColor="#718096" />
            <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="Email" placeholderTextColor="#718096" autoCapitalize="none" />
            <TextInput style={styles.input} value={password} onChangeText={setPassword} placeholder="Password" placeholderTextColor="#718096" secureTextEntry />

            <Pressable style={styles.button} onPress={signup}>
              <Text style={styles.buttonText}>Create free account</Text>
            </Pressable>

            <Pressable style={styles.secondaryButton} onPress={login}>
              <Text style={styles.secondaryText}>Sign in</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const tabs = user.role === "admin"
    ? ["dashboard", "inventory", "orders", "payroll", "insights", "ai", "admin"]
    : ["dashboard", "inventory", "orders", "payroll", "insights", "ai"];

  return (
    <SafeAreaView style={styles.page}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.logo}>NovaOps AI</Text>
        <Text style={styles.tagline}>{user.businessName} | {user.plan} tier | {user.role}</Text>

        <Pressable style={styles.signOutButton} onPress={signOut}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </Pressable>

        <View style={styles.statusBox}>
          <Text style={styles.statusText}>{status}</Text>
        </View>

        <View style={styles.nav}>
          {tabs.map(tab => (
            <Pressable
              key={tab}
              style={[styles.navButton, screen === tab && styles.navActive]}
              onPress={async () => {
                setScreen(tab);
                if (tab === "admin") await loadAdminActions();
              }}
            >
              <Text style={styles.navText}>{tab.toUpperCase()}</Text>
            </Pressable>
          ))}
        </View>

        {screen === "dashboard" && (
          <View style={styles.card}>
            <Text style={styles.title}>Business Dashboard</Text>

            <View style={styles.row}>
              <Text style={styles.rowTitle}>Plan</Text>
              <Text style={styles.rowText}>{dashboard?.plan || "free"} tier | {dashboard?.role || user?.role || "user"}</Text>
            </View>

            <View style={styles.row}>
              <Text style={styles.rowTitle}>Inventory Items</Text>
              <Text style={styles.rowText}>{dashboard?.totalInventoryItems || 0}</Text>
            </View>

            <View style={styles.row}>
              <Text style={styles.rowTitle}>Low Stock Alerts</Text>
              <Text style={styles.rowText}>{dashboard?.lowStockItems || 0}</Text>
            </View>

            <View style={styles.row}>
              <Text style={styles.rowTitle}>Open Orders</Text>
              <Text style={styles.rowText}>{dashboard?.openOrders || 0}</Text>
            </View>

            <View style={styles.row}>
              <Text style={styles.rowTitle}>Total Orders</Text>
              <Text style={styles.rowText}>{dashboard?.totalOrders || 0}</Text>
            </View>

            <View style={styles.row}>
              <Text style={styles.rowTitle}>Employees</Text>
              <Text style={styles.rowText}>{dashboard?.totalEmployees || 0}</Text>
            </View>

            <View style={styles.row}>
              <Text style={styles.rowTitle}>Monthly Payroll Estimate</Text>
              <Text style={styles.rowText}>${Number(dashboard?.monthlyPayrollEstimate || 0).toFixed(2)}</Text>
            </View>

            <View style={styles.row}>
              <Text style={styles.rowTitle}>Inventory Value</Text>
              <Text style={styles.rowText}>${Number(dashboard?.totalInventoryValue || 0).toFixed(2)}</Text>
            </View>

            {user?.role === "admin" && (
              <View style={styles.row}>
                <Text style={styles.rowTitle}>AI Actions Needing Approval</Text>
                <Text style={styles.rowText}>{dashboard?.aiActionsNeedingApproval || 0}</Text>
              </View>
            )}

            <Pressable style={styles.button} onPress={() => loadAll()}>
              <Text style={styles.buttonText}>Refresh Dashboard</Text>
            </Pressable>
          </View>
        )}

        {screen === "inventory" && (
          <View style={styles.card}>
            <Text style={styles.title}>Inventory</Text>

            <TextInput style={styles.input} value={itemName} onChangeText={setItemName} placeholder="Item name" placeholderTextColor="#718096" />
            <TextInput style={styles.input} value={quantity} onChangeText={setQuantity} placeholder="Quantity" placeholderTextColor="#718096" keyboardType="numeric" />
            <TextInput style={styles.input} value={reorderPoint} onChangeText={setReorderPoint} placeholder="Reorder point" placeholderTextColor="#718096" keyboardType="numeric" />
            <TextInput style={styles.input} value={salesLast30Days} onChangeText={setSalesLast30Days} placeholder="Sales last 30 days" placeholderTextColor="#718096" keyboardType="numeric" />

            <Pressable style={styles.button} onPress={addInventory}>
              <Text style={styles.buttonText}>Add Inventory</Text>
            </Pressable>

            {inventory.length === 0 && <Text style={styles.rowText}>No inventory yet.</Text>}

            {inventory.map(item => (
              <View key={item.id} style={styles.row}>
                <Text style={styles.rowTitle}>{item.name}</Text>
                <Text style={styles.rowText}>Qty: {item.quantity} | Reorder at: {item.reorderPoint}</Text>

                <View style={styles.actionRow}>
                  <Pressable style={styles.smallButton} onPress={() => {
                    setItemName(item.name);
                    setQuantity(String(item.quantity));
                    setReorderPoint(String(item.reorderPoint));
                    setSalesLast30Days(String(item.salesLast30Days || 0));
                    setStatus("Loaded " + item.name + " into edit form.");
                  }}>
                    <Text style={styles.buttonText}>Load</Text>
                  </Pressable>

                  <Pressable style={styles.smallButton} onPress={() => editInventory(item)}>
                    <Text style={styles.buttonText}>Save Edit</Text>
                  </Pressable>

                  <Pressable style={styles.smallButton} onPress={() => reorder(item)}>
                    <Text style={styles.buttonText}>Reorder</Text>
                  </Pressable>

                  <Pressable style={styles.deleteButton} onPress={() => deleteInventory(item)}>
                    <Text style={styles.deleteText}>Delete</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}


        {screen === "orders" && (
          <View style={styles.card}>
            <Text style={styles.title}>Orders</Text>

            <Pressable style={styles.button} onPress={() => loadAll()}>
              <Text style={styles.buttonText}>Refresh Orders</Text>
            </Pressable>

            {orders.length === 0 && (
              <Text style={styles.rowText}>No orders yet. Go to Inventory and click Reorder on an item.</Text>
            )}

            {orders.map(order => (
              <View key={order.id} style={styles.row}>
                <Text style={styles.rowTitle}>{order.itemName}</Text>
                <Text style={styles.rowText}>Quantity ordered: {order.quantityOrdered}</Text>
                <Text style={styles.rowText}>Status: {order.status}</Text>
                <Text style={styles.rowText}>Created: {order.createdAt}</Text>

                <View style={styles.actionRow}>
                  <Pressable style={styles.smallButton} onPress={() => updateOrderStatus(order, "ordered")}>
                    <Text style={styles.buttonText}>Mark Ordered</Text>
                  </Pressable>

                  <Pressable style={styles.approveButton} onPress={() => updateOrderStatus(order, "received")}>
                    <Text style={styles.buttonText}>Mark Received</Text>
                  </Pressable>

                  <Pressable style={styles.rejectButton} onPress={() => updateOrderStatus(order, "cancelled")}>
                    <Text style={styles.rejectText}>Cancel</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}

        {screen === "payroll" && (
          <View style={styles.card}>
            <Text style={styles.title}>Payroll</Text>

            <TextInput style={styles.input} value={employeeName} onChangeText={setEmployeeName} placeholder="Employee name" placeholderTextColor="#718096" />
            <TextInput style={styles.input} value={payRate} onChangeText={setPayRate} placeholder="Hourly pay rate" placeholderTextColor="#718096" keyboardType="numeric" />
            <TextInput style={styles.input} value={hours} onChangeText={setHours} placeholder="Hours" placeholderTextColor="#718096" keyboardType="numeric" />

            <Pressable style={styles.button} onPress={addEmployee}>
              <Text style={styles.buttonText}>Add Employee</Text>
            </Pressable>

            {employees.length === 0 && <Text style={styles.rowText}>No employees yet.</Text>}

            {employees.map(emp => (
              <View key={emp.id} style={styles.row}>
                <Text style={styles.rowTitle}>{emp.name}</Text>
                <Text style={styles.rowText}>${emp.payRate}/hour</Text>

                <View style={styles.actionRow}>
                  <Pressable style={styles.smallButton} onPress={() => {
                    setEmployeeName(emp.name);
                    setPayRate(String(emp.payRate));
                    setStatus("Loaded " + emp.name + " into edit form.");
                  }}>
                    <Text style={styles.buttonText}>Load</Text>
                  </Pressable>

                  <Pressable style={styles.smallButton} onPress={() => editEmployee(emp)}>
                    <Text style={styles.buttonText}>Save Edit</Text>
                  </Pressable>

                  <Pressable style={styles.smallButton} onPress={() => calculatePayroll(emp)}>
                    <Text style={styles.buttonText}>Calculate Pay</Text>
                  </Pressable>

                  <Pressable style={styles.employeeDeleteButton} onPress={() => deleteEmployee(emp)}>
                    <Text style={styles.employeeDeleteText}>DELETE EMPLOYEE</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}

        {screen === "insights" && (() => {
          const inventoryList = inventory || [];
          const orderList = orders || [];
          const employeeList = employees || [];

          const lowStock = inventoryList.filter(item =>
            Number(item.quantity || 0) <= Number(item.reorderPoint || 0)
          );

          const fastestSeller = [...inventoryList].sort((a, b) =>
            Number(b.salesLast30Days || 0) - Number(a.salesLast30Days || 0)
          )[0];

          const mostUrgent = [...inventoryList].sort((a, b) => {
            const aDaily = Number(a.salesLast30Days || 0) / 30;
            const bDaily = Number(b.salesLast30Days || 0) / 30;
            const aDays = aDaily > 0 ? Number(a.quantity || 0) / aDaily : 999999;
            const bDays = bDaily > 0 ? Number(b.quantity || 0) / bDaily : 999999;
            return aDays - bDays;
          })[0];

          const openOrders = orderList.filter(order =>
            !["received", "completed", "cancelled"].includes(String(order.status || "").toLowerCase())
          );

          const inventoryValue = inventoryList.reduce((sum, item) =>
            sum + Number(item.quantity || 0) * Number(item.cost || 0), 0
          );

          const weeklyPayrollEstimate = employeeList.reduce((sum, employee) =>
            sum + Number(employee.payRate || 0) * 40, 0
          );

          const healthScore =
            100
            - (lowStock.length * 10)
            - (openOrders.length * 5);

          const healthLabel =
            healthScore >= 90
              ? "Healthy"
              : healthScore >= 70
              ? "Warning"
              : "Critical";

          const executiveSummary =
            lowStock.length > 0
              ? "Business needs attention. Focus on low-stock inventory and open orders."
              : "Business operations appear stable with no major inventory risks.";

          return (
            <View style={styles.card}>
              <Text style={styles.title}>Business Insights</Text>

              <View style={styles.row}>
                <Text style={styles.rowTitle}>Business Health Score</Text>
                <Text style={styles.rowText}>
                  {healthScore}/100 ({healthLabel})
                </Text>
              </View>

              <View style={styles.row}>
                <Text style={styles.rowTitle}>Executive Summary</Text>
                <Text style={styles.rowText}>
                  {executiveSummary}
                </Text>
              </View>

              <View style={styles.row}>
                <Text style={styles.rowTitle}>GPT Executive Summary</Text>
                <Text style={styles.rowText}>
                  {executiveAiSummary || "Click Generate AI Summary to create a GPT-powered business summary."}
                </Text>
              </View>

              <Pressable style={styles.button} onPress={() => loadExecutiveSummary()}>
                <Text style={styles.buttonText}>Generate AI Summary</Text>
              </Pressable>

              <View style={styles.row}>
                <Text style={styles.rowTitle}>Urgent Inventory Alerts</Text>
                <Text style={styles.rowText}>
                  {lowStock.length > 0
                    ? lowStock.length + " item(s) are at or below reorder point."
                    : "No urgent low-stock alerts right now."}
                </Text>
              </View>

              <View style={styles.row}>
                <Text style={styles.rowTitle}>Most Urgent Item</Text>
                <Text style={styles.rowText}>
                  {mostUrgent
                    ? mostUrgent.name + " has " + Number(mostUrgent.quantity || 0) + " units on hand."
                    : "Add inventory to generate this insight."}
                </Text>
              </View>

              <View style={styles.row}>
                <Text style={styles.rowTitle}>Fastest Seller</Text>
                <Text style={styles.rowText}>
                  {fastestSeller
                    ? fastestSeller.name + " sold " + Number(fastestSeller.salesLast30Days || 0) + " units in the last 30 days."
                    : "Add sales data to generate this insight."}
                </Text>
              </View>

              <View style={styles.row}>
                <Text style={styles.rowTitle}>Open Orders</Text>
                <Text style={styles.rowText}>
                  {openOrders.length} open order(s) need tracking.
                </Text>
              </View>

              <View style={styles.row}>
                <Text style={styles.rowTitle}>Inventory Value</Text>
                <Text style={styles.rowText}>
                  ${inventoryValue.toFixed(2)} currently stored in inventory.
                </Text>
              </View>

              <View style={styles.row}>
                <Text style={styles.rowTitle}>Estimated Weekly Payroll</Text>
                <Text style={styles.rowText}>
                  ${weeklyPayrollEstimate.toFixed(2)} based on 40 hours per employee.
                </Text>
              </View>

              <View style={styles.row}>
                <Text style={styles.rowTitle}>AI Summary</Text>
                <Text style={styles.rowText}>
                  {lowStock.length > 0
                    ? "Focus today: resolve low-stock items and open orders."
                    : "Business operations look stable based on current inventory data."}
                </Text>
              </View>

              <Pressable style={styles.button} onPress={() => loadAll()}>
                <Text style={styles.buttonText}>Refresh Business Insights</Text>
              </Pressable>
            </View>
          );
        })()}

        {screen === "ai" && (
          <View style={styles.card}>
            <Text style={styles.title}>AI Recommendations</Text>

            <Pressable style={styles.button} onPress={() => loadAll()}>
              <Text style={styles.buttonText}>Update AI Suggestions</Text>
            </Pressable>

            {recommendations.length === 0 && (
              <Text style={styles.rowText}>No AI suggestions yet. Add inventory first.</Text>
            )}

            {recommendations.map(r => (
              <View key={r.itemId} style={styles.row}>
                <Text style={styles.rowTitle}>{r.itemName}</Text>
                <Text style={styles.rowText}>Priority: {r.priority}</Text>
                <Text style={styles.rowText}>{r.suggestion}</Text>
                <Text style={styles.rowText}>Estimated days left: {r.estimatedDaysLeft || "unknown"}</Text>
              </View>
            ))}
          </View>
        )}

        {screen === "admin" && (
          <View style={styles.card}>
            <Text style={styles.title}>Admin AI Dashboard</Text>

            <Text style={styles.rowText}>
              AI can suggest admin actions, but nothing runs without your approval.
            </Text>

            <Pressable style={styles.button} onPress={() => loadAdminActions()}>
              <Text style={styles.buttonText}>Refresh Admin AI</Text>
            </Pressable>

            {adminActions.map(action => (
              <View key={action.id} style={styles.adminCard}>
                <Text style={styles.rowTitle}>{action.title}</Text>
                <Text style={styles.rowText}>Type: {action.type}</Text>
                <Text style={styles.rowText}>Status: {action.status}</Text>
                <Text style={styles.rowText}>{action.description}</Text>

                <View style={styles.actionRow}>
                  <Pressable style={styles.approveButton} onPress={() => approveAdminAction(action)}>
                    <Text style={styles.buttonText}>Approve</Text>
                  </Pressable>

                  <Pressable style={styles.rejectButton} onPress={() => rejectAdminAction(action)}>
                    <Text style={styles.rejectText}>Reject</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#070A14" },
  container: { padding: 18, maxWidth: 950, width: "100%", alignSelf: "center" },
  logo: { color: "#8BE9FD", fontSize: 36, fontWeight: "900", marginTop: 20, textAlign: "center" },
  tagline: { color: "#C8D6FF", fontSize: 16, textAlign: "center", marginBottom: 12 },
  signOutButton: { alignSelf: "center", borderColor: "#F87171", borderWidth: 1, paddingVertical: 8, paddingHorizontal: 18, borderRadius: 12, marginBottom: 14 },
  signOutText: { color: "#FCA5A5", fontWeight: "900" },
  statusBox: { backgroundColor: "#172554", borderColor: "#38BDF8", borderWidth: 1, padding: 12, borderRadius: 14, marginBottom: 14 },
  statusText: { color: "#E0F2FE", fontWeight: "700", textAlign: "center" },
  card: { backgroundColor: "#10172A", borderColor: "#233B7A", borderWidth: 1, borderRadius: 22, padding: 18, marginBottom: 18 },
  title: { color: "#FFFFFF", fontSize: 24, fontWeight: "800", marginBottom: 12 },
  input: { backgroundColor: "#0B1020", color: "#FFFFFF", borderColor: "#2A3F75", borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 10 },
  button: { backgroundColor: "#00D4FF", padding: 14, borderRadius: 14, alignItems: "center", marginVertical: 6 },
  secondaryButton: { borderColor: "#00D4FF", borderWidth: 1, padding: 14, borderRadius: 14, alignItems: "center", marginVertical: 6 },
  buttonText: { color: "#05111E", fontWeight: "800" },
  secondaryText: { color: "#8BE9FD", fontWeight: "800" },
  proButton: { backgroundColor: "#A855F7", padding: 14, borderRadius: 14, alignItems: "center", marginVertical: 6 },
  proButtonText: { color: "#FFFFFF", fontWeight: "900" },
  proActiveBox: { backgroundColor: "#16A34A", padding: 14, borderRadius: 14, alignItems: "center", marginVertical: 6 },
  proActiveText: { color: "#FFFFFF", fontWeight: "900" },
  nav: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 },
  navButton: { padding: 10, borderRadius: 12, backgroundColor: "#111827" },
  navActive: { backgroundColor: "#1D4ED8" },
  navText: { color: "#FFFFFF", fontWeight: "700" },
  stat: { color: "#E5E7EB", fontSize: 18, marginVertical: 5 },
  limitBox: { backgroundColor: "#111827", borderColor: "#38BDF8", borderWidth: 1, borderRadius: 14, padding: 12, marginTop: 12 },
  limitTitle: { color: "#8BE9FD", fontSize: 16, fontWeight: "900", marginBottom: 4 },
  limitText: { color: "#E5E7EB", fontSize: 15 },
  row: { backgroundColor: "#0B1020", borderRadius: 16, padding: 14, marginTop: 10, borderColor: "#243B74", borderWidth: 1 },
  rowTitle: { color: "#FFFFFF", fontSize: 18, fontWeight: "800", marginBottom: 4 },
  rowText: { color: "#D1D5DB", marginBottom: 3 },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  smallButton: { backgroundColor: "#8BE9FD", padding: 10, borderRadius: 10, alignItems: "center", marginTop: 8, flexGrow: 1 },
  deleteButton: { backgroundColor: "#7F1D1D", padding: 10, borderRadius: 10, alignItems: "center", marginTop: 8, flexGrow: 1 },
  deleteText: { color: "#FECACA", fontWeight: "800" },
  employeeDeleteButton: { backgroundColor: "#DC2626", padding: 14, borderRadius: 12, alignItems: "center", marginTop: 8, flexGrow: 1 },
  employeeDeleteText: { color: "#FFFFFF", fontWeight: "900" },
  adminCard: { backgroundColor: "#111827", borderRadius: 16, padding: 14, marginTop: 12, borderColor: "#38BDF8", borderWidth: 1 },
  approveButton: { backgroundColor: "#22C55E", padding: 10, borderRadius: 10, alignItems: "center", flex: 1 },
  rejectButton: { borderColor: "#F87171", borderWidth: 1, padding: 10, borderRadius: 10, alignItems: "center", flex: 1 },
  rejectText: { color: "#FCA5A5", fontWeight: "800" }
});
