import React, { useEffect, useState } from "react";
import { SafeAreaView, ScrollView, View, Text, TextInput, Pressable, StyleSheet, Alert, Linking } from "react-native";

const API = "https://novaops-ai-app.onrender.com";



function screenLabel(tab) {
  const labels = {
    dashboard: "Home",
    workforce: "Workforce",
    operations: "Operations",
    insights: "Insights",
    ai: "AI Center",
    admin: "Admin"
  };

  return labels[tab] || tab;
}

function formatDate(value) {
  if (!value) return "Not set";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const year = date.getFullYear();

  return `${month}-${day}-${year}`;
}


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
  const [timeEntries, setTimeEntries] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [adminActions, setAdminActions] = useState([]);
  const [executiveAiSummary, setExecutiveAiSummary] = useState("");
  const [autopilot, setAutopilot] = useState(null);
  const [orders, setOrders] = useState([]);

  const [appointments, setAppointments] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [businessOsBriefing, setBusinessOsBriefing] = useState(null);

  const [appointmentCustomer, setAppointmentCustomer] = useState("New Customer");
  const [appointmentDate, setAppointmentDate] = useState("2026-08-01");
  const [appointmentTime, setAppointmentTime] = useState("9:00 AM");
  const [appointmentLocation, setAppointmentLocation] = useState("Main Office");

  const [taskTitle, setTaskTitle] = useState("Follow up with supplier");
  const [taskPriority, setTaskPriority] = useState("high");
  const [taskDueDate, setTaskDueDate] = useState("2026-08-01");

  const [vehicleName, setVehicleName] = useState("Work Truck 1");
  const [vehicleMileage, setVehicleMileage] = useState("10000");
  const [vehicleMaintenanceDue, setVehicleMaintenanceDue] = useState("Oil change due");
  const [supplierOrder, setSupplierOrder] = useState(null);
  const [askQuestion, setAskQuestion] = useState("What should I do today?");
  const [askAnswer, setAskAnswer] = useState(null);
  const [commandCenter, setCommandCenter] = useState(null);
  const [whatIfType, setWhatIfType] = useState("inventory_increase");
  const [whatIfAmount, setWhatIfAmount] = useState("10");
  const [whatIfResult, setWhatIfResult] = useState(null);
  const [forecast, setForecast] = useState(null);
  const [learningInsights, setLearningInsights] = useState(null);
  const [learningTitle, setLearningTitle] = useState("Reorder low-stock inventory");
  const [learningType, setLearningType] = useState("inventory");
  const [learningOutcome, setLearningOutcome] = useState("completed");
  const [ceoBriefing, setCeoBriefing] = useState(null);

  const [itemName, setItemName] = useState("Coffee Beans");
  const [quantity, setQuantity] = useState("10");
  const [reorderPoint, setReorderPoint] = useState("5");
  const [salesLast30Days, setSalesLast30Days] = useState("20");

  const [employeeName, setEmployeeName] = useState("John Worker");
  const [payRate, setPayRate] = useState("20");
  const [hours, setHours] = useState("40");

  const [attendancePercent, setAttendancePercent] = useState("100");
  const [certifications, setCertifications] = useState("");
  const [certificationExpiration, setCertificationExpiration] = useState("");
  const [managerNotes, setManagerNotes] = useState("");
  const [lastReviewDate, setLastReviewDate] = useState("");

  const [shiftDate, setShiftDate] = useState("07-27-2026");
  const [shiftStartTime, setShiftStartTime] = useState("08:00 AM");
  const [shiftEndTime, setShiftEndTime] = useState("05:00 PM");
  const [shiftRole, setShiftRole] = useState("General");

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


  async function testApiConnection() {
    try {
      setStatus("Testing API: " + API);
      const res = await fetch(API + "/");
      const raw = await res.text();
      setStatus("API test OK: " + raw.substring(0, 80));
      Alert.alert("API test OK", raw.substring(0, 200));
    } catch (e) {
      setStatus("API test failed: " + e.message + " | API: " + API);
      Alert.alert("API test failed", e.message + "\n\nAPI: " + API);
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


  async function recordLearningEvent() {
    try {
      setStatus("Recording AI learning event...");
      const data = await api("/ai/learning-events", "POST", {
        recommendationType: learningType,
        recommendationTitle: learningTitle,
        actionTaken: "user_recorded_outcome",
        outcome: learningOutcome
      });
      setStatus("AI learning event recorded.");
      Alert.alert("NovaOps learned", data.message);
      await loadLearningInsights();
    } catch (e) {
      setStatus("Learning error: " + e.message);
      Alert.alert("Learning error", e.message);
    }
  }

  async function loadLearningInsights() {
    try {
      setStatus("Loading AI learning insights...");
      const data = await api("/ai/learning-insights", "GET");
      setLearningInsights(data);
      setStatus("AI learning insights updated.");
    } catch (e) {
      setStatus("Learning insights error: " + e.message);
      Alert.alert("Learning insights error", e.message);
    }
  }

  async function loadBusinessOS() {
    try {
      setStatus("Loading Business OS...");
      const appts = await api("/appointments", "GET");
      const taskData = await api("/tasks", "GET");
      const vehicleData = await api("/vehicles", "GET");
      const briefing = await api("/ai/business-os-briefing", "GET");

      setAppointments(appts);
      setTasks(taskData);
      setVehicles(vehicleData);
      setBusinessOsBriefing(briefing);
      setStatus("Business OS updated.");
    } catch (e) {
      setStatus("Business OS error: " + e.message);
      Alert.alert("Business OS error", e.message);
    }
  }

  async function addAppointment() {
    try {
      const item = await api("/appointments", "POST", {
        customerName: appointmentCustomer,
        appointmentDate,
        appointmentTime,
        location: appointmentLocation,
        status: "scheduled"
      });
      setAppointments(current => [item, ...current]);
      setStatus("Appointment added.");
    } catch (e) {
      setStatus("Appointment error: " + e.message);
      Alert.alert("Appointment error", e.message);
    }
  }

  async function addTask() {
    try {
      const item = await api("/tasks", "POST", {
        title: taskTitle,
        priority: taskPriority,
        dueDate: taskDueDate,
        status: "open"
      });
      setTasks(current => [item, ...current]);
      setStatus("Task added.");
    } catch (e) {
      setStatus("Task error: " + e.message);
      Alert.alert("Task error", e.message);
    }
  }

  async function addVehicle() {
    try {
      const item = await api("/vehicles", "POST", {
        name: vehicleName,
        mileage: Number(vehicleMileage || 0),
        maintenanceDue: vehicleMaintenanceDue,
        status: "active"
      });
      setVehicles(current => [item, ...current]);
      setStatus("Vehicle added.");
    } catch (e) {
      setStatus("Vehicle error: " + e.message);
      Alert.alert("Vehicle error", e.message);
    }
  }

  async function loadCeoBriefing() {
    try {
      setStatus("Loading CEO Morning Briefing...");
      const data = await api("/ai/ceo-briefing", "GET");
      setCeoBriefing(data);
      setStatus("CEO Morning Briefing updated.");
    } catch (e) {
      setStatus("CEO Briefing error: " + e.message);
      Alert.alert("CEO Briefing error", e.message);
    }
  }

  async function loadCommandCenter() {
    try {
      setStatus("Loading AI Command Center...");
      const data = await api("/ai/command-center", "GET");
      setCommandCenter(data);
      setStatus("AI Command Center updated.");
    } catch (e) {
      setStatus("Command Center error: " + e.message);
      Alert.alert("Command Center error", e.message);
    }
  }

  async function runWhatIf() {
    try {
      setStatus("Running What-If Simulator...");
      const data = await api("/ai/what-if", "POST", {
        type: whatIfType,
        amount: Number(whatIfAmount || 0)
      });
      setWhatIfResult(data);
      setStatus("What-If Simulator updated.");
    } catch (e) {
      setStatus("What-If error: " + e.message);
      Alert.alert("What-If error", e.message);
    }
  }

  async function loadForecast() {
    try {
      setStatus("Loading AI Forecast...");
      const data = await api("/ai/forecast", "GET");
      setForecast(data);
      setStatus("AI Forecast updated.");
    } catch (e) {
      setStatus("Forecast error: " + e.message);
      Alert.alert("Forecast error", e.message);
    }
  }

  async function askNovaOps() {
    try {
      setStatus("Asking NovaOps...");
      const data = await api("/ai/ask", "POST", { question: askQuestion });
      setAskAnswer(data);
      setStatus("Ask NovaOps answered.");
    } catch (e) {
      setStatus("Ask NovaOps error: " + e.message);
      Alert.alert("Ask NovaOps error", e.message);
    }
  }

  async function loadAutopilot() {
    try {
      setStatus("Loading NovaOps Autopilot...");
      const data = await api("/ai/autopilot", "GET");
      setAutopilot(data);
      setStatus("NovaOps Autopilot updated.");
    } catch (e) {
      setStatus("Autopilot error: " + e.message);
      Alert.alert("Autopilot error", e.message);
    }
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
      const timeEntryData = await api("/time-entries", "GET", null, activeToken);
      const shiftData = await api("/shifts", "GET", null, activeToken);
      const rec = await api("/ai/recommendations", "GET", null, activeToken);
      const ord = await api("/orders", "GET", null, activeToken);

      setDashboard(d);
      setInventory(inv);
      setEmployees(emp);
      setTimeEntries(timeEntryData);
      setShifts(shiftData);
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

  async function generateSupplierOrder() {
    try {
      setStatus("Generating supplier order...");
      const data = await api("/ai/supplier-order", "POST", {});
      setSupplierOrder(data);
      setStatus("Supplier order draft ready for " + data.itemName + ".");
      Alert.alert("Supplier Order Draft", data.subject + "\n\n" + data.message);
    } catch (e) {
      setStatus("Supplier order error: " + e.message);
      Alert.alert("Supplier order error", e.message);
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
        payType: "hourly",
        attendancePercent,
        certifications,
        certificationExpiration,
        managerNotes,
        lastReviewDate
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
        payType: "hourly",
        attendancePercent,
        certifications,
        certificationExpiration,
        managerNotes,
        lastReviewDate
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
        await Linking.openURL(data.url);
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


  async function clockIn(employee) {
    try {
      setStatus("Clocking in " + employee.name + "...");
      await api("/time-entries/clock-in", "POST", {
        employeeId: employee.id
      });
      await loadAll();
      setStatus(employee.name + " clocked in.");
    } catch (e) {
      setStatus("Clock in error: " + e.message);
      Alert.alert("Clock in error", e.message);
    }
  }

  async function clockOut(entry) {
    try {
      setStatus("Clocking out...");
      const saved = await api("/time-entries/" + entry.id + "/clock-out", "PUT");
      await loadAll();
      setStatus("Clocked out. Hours worked: " + Number(saved.hoursWorked || 0).toFixed(2));
      Alert.alert("Clocked out", "Hours worked: " + Number(saved.hoursWorked || 0).toFixed(2));
    } catch (e) {
      setStatus("Clock out error: " + e.message);
      Alert.alert("Clock out error", e.message);
    }
  }



  async function scheduleShift(employee) {
    try {
      setStatus("Scheduling shift for " + employee.name + "...");
      await api("/shifts", "POST", {
        employeeId: employee.id,
        shiftDate,
        startTime: shiftStartTime,
        endTime: shiftEndTime,
        role: shiftRole,
        status: "scheduled"
      });
      await loadAll();
      setStatus("Shift scheduled for " + employee.name + ".");
    } catch (e) {
      setStatus("Shift scheduling error: " + e.message);
      Alert.alert("Shift scheduling error", e.message);
    }
  }

  async function updateShiftStatus(shift, status) {
    try {
      setStatus("Updating shift...");
      await api("/shifts/" + shift.id + "/status", "PUT", { status });
      await loadAll();
      setStatus("Shift marked as " + status + ".");
    } catch (e) {
      setStatus("Shift update error: " + e.message);
      Alert.alert("Shift update error", e.message);
    }
  }

  async function deleteShift(shift) {
    try {
      setStatus("Deleting shift...");
      await api("/shifts/" + shift.id, "DELETE");
      await loadAll();
      setStatus("Shift deleted.");
    } catch (e) {
      setStatus("Shift delete error: " + e.message);
      Alert.alert("Shift delete error", e.message);
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

          <Pressable style={styles.button} onPress={testApiConnection}>
            <Text style={styles.buttonText}>Test API Connection</Text>
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
    ? ["dashboard", "workforce", "operations", "insights", "ai", "admin"]
    : ["dashboard", "workforce", "operations", "insights", "ai"];

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

        <View style={styles.osHero}>
          <Text style={styles.osEyebrow}>NovaOps OS V3</Text>
          <Text style={styles.osTitle}>Business Command Center</Text>
          <Text style={styles.osSubtitle}>Manage workforce, operations, financials, and AI decisions from one organized system.</Text>
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
              <Text style={styles.navText}>{screenLabel(tab)}</Text>
            </Pressable>
          ))}
        </View>

        {screen === "dashboard" && (
          <View style={styles.card}>
            <Text style={styles.title}>Business Dashboard</Text>

            <View style={styles.kpiGrid}>
              <View style={styles.kpiCard}>
                <Text style={styles.kpiLabel}>Employees</Text>
                <Text style={styles.kpiValue}>{employees.length}</Text>
              </View>

              <View style={styles.kpiCard}>
                <Text style={styles.kpiLabel}>Inventory</Text>
                <Text style={styles.kpiValue}>{inventory.length}</Text>
              </View>

              <View style={styles.kpiCard}>
                <Text style={styles.kpiLabel}>Orders</Text>
                <Text style={styles.kpiValue}>{orders.length}</Text>
              </View>

              <View style={styles.kpiCard}>
                <Text style={styles.kpiLabel}>Shifts</Text>
                <Text style={styles.kpiValue}>{shifts.length}</Text>
              </View>
            </View>

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Today at a Glance</Text>
              <Text style={styles.sectionText}>A simplified snapshot of your people, inventory, and active business work.</Text>
            </View>



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

            <Pressable style={styles.button} onPress={upgradeToPro}>
              <Text style={styles.buttonText}>Upgrade To Pro</Text>
            </Pressable>
          </View>
        )}

        {screen === "operations" && (
          <View style={styles.card}>
            <Text style={styles.title}>Operations: Inventory</Text>

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Operations Center</Text>
              <Text style={styles.sectionText}>Inventory, orders, vehicles, tasks, and appointments are grouped into daily operations.</Text>
            </View>



            <TextInput style={styles.input} value={itemName} onChangeText={setItemName} placeholder="Item name" placeholderTextColor="#718096" />
            <TextInput style={styles.input} value={quantity} onChangeText={setQuantity} placeholder="Quantity" placeholderTextColor="#718096" keyboardType="numeric" />
            <TextInput style={styles.input} value={reorderPoint} onChangeText={setReorderPoint} placeholder="Reorder point" placeholderTextColor="#718096" keyboardType="numeric" />
            <TextInput style={styles.input} value={salesLast30Days} onChangeText={setSalesLast30Days} placeholder="Sales last 30 days" placeholderTextColor="#718096" keyboardType="numeric" />

            <Pressable style={styles.button} onPress={addInventory}>
              <Text style={styles.buttonText}>Add Inventory</Text>
            </Pressable>

            <Pressable style={styles.button} onPress={generateSupplierOrder}>
              <Text style={styles.buttonText}>AI Supplier Order Assistant</Text>
            </Pressable>

            {supplierOrder && (
              <View style={styles.row}>
                <Text style={styles.rowTitle}>Supplier Order Draft</Text>
                <Text style={styles.rowText}>Item: {supplierOrder.itemName}</Text>
                <Text style={styles.rowText}>Urgency: {supplierOrder.urgency}</Text>
                <Text style={styles.rowText}>Suggested Quantity: {supplierOrder.suggestedQuantity}</Text>
                <Text style={styles.rowText}>Subject: {supplierOrder.subject}</Text>
                <Text style={styles.rowText}>{supplierOrder.message}</Text>
              </View>
            )}

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


        {screen === "operations" && (
          <View style={styles.card}>
            <Text style={styles.title}>Operations: Orders</Text>

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

        {screen === "workforce" && (
          <View style={styles.card}>
            <Text style={styles.title}>Workforce Hub</Text>

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Workforce Management</Text>
              <Text style={styles.sectionText}>Employees, payroll, attendance, certifications, time clock, and shift scheduling are now grouped here.</Text>
            </View>



            {(() => {
              const employeeList = employees || [];

              const averageAttendance = employeeList.length
                ? Math.round(employeeList.reduce((sum, emp) => sum + Number(emp.attendancePercent || 0), 0) / employeeList.length)
                : 0;

              const attendanceRisks = employeeList.filter(emp => Number(emp.attendancePercent || 0) < 90).length;

              const reviewsDue = employeeList.filter(emp => {
                if (!emp.lastReviewDate) return true;
                const lastReview = new Date(emp.lastReviewDate);
                if (Number.isNaN(lastReview.getTime())) return true;
                const daysSinceReview = (new Date() - lastReview) / (1000 * 60 * 60 * 24);
                return daysSinceReview > 180;
              }).length;

              const expiringCertifications = employeeList.filter(emp => {
                if (!emp.certificationExpiration) return false;
                const expiration = new Date(emp.certificationExpiration);
                if (Number.isNaN(expiration.getTime())) return false;
                const daysUntilExpiration = (expiration - new Date()) / (1000 * 60 * 60 * 24);
                return daysUntilExpiration >= 0 && daysUntilExpiration <= 60;
              }).length;

              const workforceHealth =
                averageAttendance >= 95 && attendanceRisks === 0 && reviewsDue === 0
                  ? "Excellent"
                  : averageAttendance >= 90
                    ? "Stable"
                    : "Needs Attention";

              return (
                <View style={styles.row}>
                  <Text style={styles.rowTitle}>AI Workforce Insights</Text>
                  <Text style={styles.rowText}>Workforce Health: {workforceHealth}</Text>
                  <Text style={styles.rowText}>Average Attendance: {averageAttendance}%</Text>
                  <Text style={styles.rowText}>Attendance Risks: {attendanceRisks}</Text>
                  <Text style={styles.rowText}>Reviews Needed: {reviewsDue}</Text>
                  <Text style={styles.rowText}>Certifications Expiring Soon: {expiringCertifications}</Text>
                </View>
              );
            })()}

            <TextInput style={styles.input} value={employeeName} onChangeText={setEmployeeName} placeholder="Employee name" placeholderTextColor="#718096" />
            <TextInput style={styles.input} value={payRate} onChangeText={setPayRate} placeholder="Hourly pay rate" placeholderTextColor="#718096" keyboardType="numeric" />
            <TextInput style={styles.input} value={hours} onChangeText={setHours} placeholder="Hours" placeholderTextColor="#718096" keyboardType="numeric" />

            <TextInput style={styles.input} value={attendancePercent} onChangeText={setAttendancePercent} placeholder="Attendance %" placeholderTextColor="#718096" keyboardType="numeric" />
            <TextInput style={styles.input} value={certifications} onChangeText={setCertifications} placeholder="Certifications" placeholderTextColor="#718096" />
            <TextInput style={styles.input} value={certificationExpiration} onChangeText={setCertificationExpiration} placeholder="Certification Expiration YYYY-MM-DD" placeholderTextColor="#718096" />
            <TextInput style={styles.input} value={lastReviewDate} onChangeText={setLastReviewDate} placeholder="Last Review Date YYYY-MM-DD" placeholderTextColor="#718096" />
            <TextInput style={styles.input} value={managerNotes} onChangeText={setManagerNotes} placeholder="Manager Notes" placeholderTextColor="#718096" multiline />

            <Pressable style={styles.button} onPress={addEmployee}>
              <Text style={styles.buttonText}>Add Employee</Text>
            </Pressable>

            <View style={styles.row}>
              <Text style={styles.rowTitle}>Shift Scheduler</Text>
              <Text style={styles.rowText}>Set shift details, then tap Schedule Shift on an employee card.</Text>

              <TextInput style={styles.input} value={shiftDate} onChangeText={setShiftDate} placeholder="Shift Date MM-DD-YYYY" placeholderTextColor="#718096" />
              <TextInput style={styles.input} value={shiftStartTime} onChangeText={setShiftStartTime} placeholder="Start Time" placeholderTextColor="#718096" />
              <TextInput style={styles.input} value={shiftEndTime} onChangeText={setShiftEndTime} placeholder="End Time" placeholderTextColor="#718096" />
              <TextInput style={styles.input} value={shiftRole} onChangeText={setShiftRole} placeholder="Shift Role" placeholderTextColor="#718096" />

              <Text style={styles.rowText}>AI Staffing Alert: {employees.length === 0 ? "Add employees before scheduling shifts." : shifts.length === 0 ? "No upcoming shifts scheduled." : "Upcoming shift coverage is active."}</Text>
            </View>


            {employees.length === 0 && <Text style={styles.rowText}>No employees yet.</Text>}

            {shifts.length > 0 && (
              <View style={styles.row}>
                <Text style={styles.rowTitle}>Upcoming Shifts</Text>
                {shifts.slice(0, 8).map(shift => (
                  <View key={shift.id} style={styles.row}>
                    <Text style={styles.rowTitle}>{shift.employeeName}</Text>
                    <Text style={styles.rowText}>Date: {formatDate(shift.shiftDate)}</Text>
                    <Text style={styles.rowText}>Time: {shift.startTime} - {shift.endTime}</Text>
                    <Text style={styles.rowText}>Role: {shift.role || "General"}</Text>
                    <Text style={styles.rowText}>Status: {shift.status}</Text>

                    <View style={styles.actionRow}>
                      <Pressable style={styles.smallButton} onPress={() => updateShiftStatus(shift, "completed")}>
                        <Text style={styles.buttonText}>Complete</Text>
                      </Pressable>

                      <Pressable style={styles.smallButton} onPress={() => updateShiftStatus(shift, "cancelled")}>
                        <Text style={styles.buttonText}>Cancel</Text>
                      </Pressable>

                      <Pressable style={styles.employeeDeleteButton} onPress={() => deleteShift(shift)}>
                        <Text style={styles.employeeDeleteText}>DELETE</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {timeEntries.length > 0 && (
              <View style={styles.row}>
                <Text style={styles.rowTitle}>Recent Time Entries</Text>
                {timeEntries.slice(0, 5).map(entry => (
                  <Text key={entry.id} style={styles.rowText}>
                    {entry.employeeName}: {entry.status} | In: {formatDate(entry.clockInAt)} {entry.clockOutAt ? "| Out: " + formatDate(entry.clockOutAt) + " | Hours: " + Number(entry.hoursWorked || 0).toFixed(2) : ""}
                  </Text>
                ))}
              </View>
            )}

            {employees.map(emp => (
              <View key={emp.id} style={styles.row}>
                <Text style={styles.rowTitle}>{emp.name}</Text>
                <Text style={styles.rowText}>${emp.payRate}/hour</Text>
                <Text style={styles.rowText}>Attendance: {emp.attendancePercent || 0}%</Text>
                <Text style={styles.rowText}>Certifications: {emp.certifications || "None"}</Text>
                <Text style={styles.rowText}>Certification Exp: {formatDate(emp.certificationExpiration)}</Text>
                <Text style={styles.rowText}>Review Date: {formatDate(emp.lastReviewDate)}</Text>
                <Text style={styles.rowText}>Notes: {emp.managerNotes || "None"}</Text>
                {(() => {
                  const openEntry = timeEntries.find(entry => entry.employeeId === emp.id && !entry.clockOutAt);
                  return (
                    <Text style={styles.rowText}>
                      Clock Status: {openEntry ? "Clocked In since " + new Date(openEntry.clockInAt).toLocaleString() : "Clocked Out"}
                    </Text>
                  );
                })()}

                <View style={styles.actionRow}>
                  <Pressable style={styles.smallButton} onPress={() => {
                    setEmployeeName(emp.name);
                    setPayRate(String(emp.payRate));
                    setAttendancePercent(String(emp.attendancePercent || "100"));
                    setCertifications(emp.certifications || "");
                    setCertificationExpiration(emp.certificationExpiration || "");
                    setManagerNotes(emp.managerNotes || "");
                    setLastReviewDate(emp.lastReviewDate || "");
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

                  <Pressable style={styles.approveButton} onPress={() => clockIn(emp)}>
                    <Text style={styles.buttonText}>Clock In</Text>
                  </Pressable>

                  <Pressable style={styles.smallButton} onPress={() => scheduleShift(emp)}>
                    <Text style={styles.buttonText}>Schedule Shift</Text>
                  </Pressable>

                  <Pressable style={styles.smallButton} onPress={() => {
                    const openEntry = timeEntries.find(entry => entry.employeeId === emp.id && !entry.clockOutAt);
                    if (!openEntry) {
                      Alert.alert("Clock out unavailable", emp.name + " is not currently clocked in.");
                      return;
                    }
                    clockOut(openEntry);
                  }}>
                    <Text style={styles.buttonText}>Clock Out</Text>
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

              <Text style={styles.rowTitle}>Business OS</Text>
              <Text style={styles.rowText}>Manage appointments, tasks, and vehicles from NovaOps.</Text>

              <Pressable style={styles.button} onPress={loadBusinessOS}>
                <Text style={styles.buttonText}>Load Business OS Briefing</Text>
              </Pressable>

              {businessOsBriefing && (
                <View style={styles.row}>
                  <Text style={styles.rowTitle}>Business OS Briefing</Text>
                  <Text style={styles.rowText}>{businessOsBriefing.summary}</Text>

                  <Text style={styles.rowTitle}>Recommended Actions</Text>
                  {businessOsBriefing.actions.map((item, index) => (
                    <Text key={"bos-action-" + index} style={styles.rowText}>
                      {index + 1}. {item}
                    </Text>
                  ))}
                </View>
              )}

              <Text style={styles.rowTitle}>Add Appointment</Text>
              <TextInput style={styles.input} value={appointmentCustomer} onChangeText={setAppointmentCustomer} placeholder="Customer name" placeholderTextColor="#94A3B8" />
              <TextInput style={styles.input} value={appointmentDate} onChangeText={setAppointmentDate} placeholder="Date" placeholderTextColor="#94A3B8" />
              <TextInput style={styles.input} value={appointmentTime} onChangeText={setAppointmentTime} placeholder="Time" placeholderTextColor="#94A3B8" />
              <TextInput style={styles.input} value={appointmentLocation} onChangeText={setAppointmentLocation} placeholder="Location" placeholderTextColor="#94A3B8" />
              <Pressable style={styles.button} onPress={addAppointment}>
                <Text style={styles.buttonText}>Add Appointment</Text>
              </Pressable>

              {appointments.slice(0, 3).map((item, index) => (
                <View key={"appointment-" + item.id + index} style={styles.row}>
                  <Text style={styles.rowTitle}>{item.customerName}</Text>
                  <Text style={styles.rowText}>{item.appointmentDate} at {item.appointmentTime}</Text>
                  <Text style={styles.rowText}>{item.location}</Text>
                  <Text style={styles.rowText}>Status: {item.status}</Text>
                </View>
              ))}

              <Text style={styles.rowTitle}>Add Task</Text>
              <TextInput style={styles.input} value={taskTitle} onChangeText={setTaskTitle} placeholder="Task title" placeholderTextColor="#94A3B8" />
              <TextInput style={styles.input} value={taskPriority} onChangeText={setTaskPriority} placeholder="Priority" placeholderTextColor="#94A3B8" />
              <TextInput style={styles.input} value={taskDueDate} onChangeText={setTaskDueDate} placeholder="Due date" placeholderTextColor="#94A3B8" />
              <Pressable style={styles.button} onPress={addTask}>
                <Text style={styles.buttonText}>Add Task</Text>
              </Pressable>

              {tasks.slice(0, 3).map((item, index) => (
                <View key={"task-" + item.id + index} style={styles.row}>
                  <Text style={styles.rowTitle}>{item.title}</Text>
                  <Text style={styles.rowText}>Priority: {item.priority}</Text>
                  <Text style={styles.rowText}>Due: {item.dueDate}</Text>
                  <Text style={styles.rowText}>Status: {item.status}</Text>
                </View>
              ))}

              <Text style={styles.rowTitle}>Add Vehicle</Text>
              <TextInput style={styles.input} value={vehicleName} onChangeText={setVehicleName} placeholder="Vehicle name" placeholderTextColor="#94A3B8" />
              <TextInput style={styles.input} value={vehicleMileage} onChangeText={setVehicleMileage} placeholder="Mileage" placeholderTextColor="#94A3B8" keyboardType="numeric" />
              <TextInput style={styles.input} value={vehicleMaintenanceDue} onChangeText={setVehicleMaintenanceDue} placeholder="Maintenance due" placeholderTextColor="#94A3B8" />
              <Pressable style={styles.button} onPress={addVehicle}>
                <Text style={styles.buttonText}>Add Vehicle</Text>
              </Pressable>

              {vehicles.slice(0, 3).map((item, index) => (
                <View key={"vehicle-" + item.id + index} style={styles.row}>
                  <Text style={styles.rowTitle}>{item.name}</Text>
                  <Text style={styles.rowText}>Mileage: {item.mileage}</Text>
                  <Text style={styles.rowText}>Maintenance: {item.maintenanceDue}</Text>
                  <Text style={styles.rowText}>Status: {item.status}</Text>
                </View>
              ))}

              <Pressable style={styles.button} onPress={loadCeoBriefing}>
                <Text style={styles.buttonText}>Generate CEO Morning Briefing</Text>
              </Pressable>

              {ceoBriefing && (
                <View style={styles.row}>
                  <Text style={styles.rowTitle}>CEO Morning Briefing</Text>
                  <Text style={styles.rowText}>{ceoBriefing.briefing}</Text>

                  <Text style={styles.rowTitle}>Business Health Score</Text>
                  <Text style={styles.rowText}>{ceoBriefing.healthScore}/100</Text>

                  <Text style={styles.rowTitle}>Biggest Risk</Text>
                  <Text style={styles.rowText}>{ceoBriefing.biggestRisk}</Text>

                  <Text style={styles.rowTitle}>Today's Priorities</Text>
                  {ceoBriefing.priorities.map((item, index) => (
                    <Text key={"ceo-priority-" + index} style={styles.rowText}>
                      {index + 1}. [{item.level.toUpperCase()}] {item.title}: {item.detail}
                    </Text>
                  ))}
                </View>
              )}

              <Text style={styles.rowTitle}>AI Self-Learning Engine</Text>
              <TextInput
                style={styles.input}
                value={learningTitle}
                onChangeText={setLearningTitle}
                placeholder="Recommendation title"
                placeholderTextColor="#718096"
              />
              <TextInput
                style={styles.input}
                value={learningType}
                onChangeText={setLearningType}
                placeholder="inventory, orders, payroll, risk"
                placeholderTextColor="#718096"
              />
              <TextInput
                style={styles.input}
                value={learningOutcome}
                onChangeText={setLearningOutcome}
                placeholder="completed, stockout_avoided, ignored, late"
                placeholderTextColor="#718096"
              />

              <Pressable style={styles.button} onPress={recordLearningEvent}>
                <Text style={styles.buttonText}>Record Recommendation Outcome</Text>
              </Pressable>

              <Pressable style={styles.button} onPress={loadLearningInsights}>
                <Text style={styles.buttonText}>View AI Learning Insights</Text>
              </Pressable>

              {learningInsights && (
                <View style={styles.row}>
                  <Text style={styles.rowTitle}>AI Learning Insights</Text>
                  <Text style={styles.rowText}>{learningInsights.summary}</Text>
                  <Text style={styles.rowTitle}>Learning Score</Text>
                  <Text style={styles.rowText}>{learningInsights.learningScore}%</Text>
                  <Text style={styles.rowTitle}>Next Best Learning Action</Text>
                  <Text style={styles.rowText}>{learningInsights.nextBestLearningAction}</Text>

                  {learningInsights.patterns && learningInsights.patterns.length > 0 && (
                    <>
                      <Text style={styles.rowTitle}>Learned Patterns</Text>
                      {learningInsights.patterns.map((pattern, index) => (
                        <Text key={"learning-pattern-" + index} style={styles.rowText}>
                          {index + 1}. {pattern.type}: {pattern.insight}
                        </Text>
                      ))}
                    </>
                  )}
                </View>
              )}

              <Pressable style={styles.button} onPress={loadCommandCenter}>
                <Text style={styles.buttonText}>Open AI Command Center</Text>
              </Pressable>

              {commandCenter && (
                <View style={styles.row}>
                  <Text style={styles.rowTitle}>AI Command Center</Text>
                  <Text style={styles.rowText}>{commandCenter.commandBriefing}</Text>
                  <Text style={styles.rowTitle}>Health Score</Text>
                  <Text style={styles.rowText}>{commandCenter.healthScore}/100</Text>
                  <Text style={styles.rowTitle}>Today's Command Cards</Text>
                  {commandCenter.cards.map((card, index) => (
                    <Text key={"command-card-" + index} style={styles.rowText}>
                      {index + 1}. [{card.status.toUpperCase()}] {card.title}: {card.summary} Action: {card.action}
                    </Text>
                  ))}
                </View>
              )}

              <Text style={styles.rowTitle}>AI What-If Simulator</Text>
              <TextInput
                style={styles.input}
                value={whatIfType}
                onChangeText={setWhatIfType}
                placeholder="inventory_increase, sales_drop, hire_employee"
                placeholderTextColor="#718096"
              />
              <TextInput
                style={styles.input}
                value={whatIfAmount}
                onChangeText={setWhatIfAmount}
                placeholder="Amount"
                placeholderTextColor="#718096"
                keyboardType="numeric"
              />
              <Pressable style={styles.button} onPress={runWhatIf}>
                <Text style={styles.buttonText}>Run What-If Simulation</Text>
              </Pressable>

              {whatIfResult && (
                <View style={styles.row}>
                  <Text style={styles.rowTitle}>{whatIfResult.title}</Text>
                  <Text style={styles.rowText}>{whatIfResult.summary}</Text>
                  {whatIfResult.impact.map((item, index) => (
                    <Text key={"what-if-" + index} style={styles.rowText}>
                      {index + 1}. {item}
                    </Text>
                  ))}
                </View>
              )}

              <Pressable style={styles.button} onPress={loadForecast}>
                <Text style={styles.buttonText}>Run AI Forecast</Text>
              </Pressable>

              {forecast && (
                <View style={styles.row}>
                  <Text style={styles.rowTitle}>AI Forecast</Text>
                  <Text style={styles.rowText}>{forecast.summary}</Text>
                  {forecast.forecasts.slice(0, 5).map((item, index) => (
                    <Text key={"forecast-" + index} style={styles.rowText}>
                      {index + 1}. {item.itemName}: {item.stockoutRisk} risk, estimated stockout in {item.estimatedDaysUntilStockout === null ? "unknown" : item.estimatedDaysUntilStockout + " day(s)"}
                    </Text>
                  ))}
                </View>
              )}

              <Text style={styles.rowTitle}>Ask NovaOps</Text>
              <TextInput
                style={styles.input}
                value={askQuestion}
                onChangeText={setAskQuestion}
                placeholder="Ask about inventory, payroll, orders, or risks"
                placeholderTextColor="#718096"
              />

              <Pressable style={styles.button} onPress={askNovaOps}>
                <Text style={styles.buttonText}>Ask NovaOps</Text>
              </Pressable>

              {askAnswer && (
                <View style={styles.row}>
                  <Text style={styles.rowTitle}>NovaOps Answer</Text>
                  <Text style={styles.rowText}>{askAnswer.answer}</Text>

                  {askAnswer.actions && askAnswer.actions.length > 0 && (
                    <>
                      <Text style={styles.rowTitle}>Suggested Actions</Text>
                      {askAnswer.actions.map((item, index) => (
                        <Text key={"ask-action-" + index} style={styles.rowText}>
                          {index + 1}. {item}
                        </Text>
                      ))}
                    </>
                  )}
                </View>
              )}

              <Pressable style={styles.button} onPress={loadAutopilot}>
                <Text style={styles.buttonText}>Run AI Operations Autopilot</Text>
              </Pressable>

              {autopilot && (
                <View style={styles.row}>
                  <Text style={styles.rowTitle}>NovaOps Autopilot</Text>
                  <Text style={styles.rowText}>{autopilot.briefing}</Text>

                  <Text style={styles.rowTitle}>Top Actions</Text>
                  {autopilot.priorityActions.map((item, index) => (
                    <Text key={index} style={styles.rowText}>
                      {index + 1}. {item.title}: {item.action}
                    </Text>
                  ))}

                  <Text style={styles.rowTitle}>Risk Radar</Text>
                  {autopilot.risks.map((risk, index) => (
                    <Text key={"risk-" + index} style={styles.rowText}>
                      {risk.name}: {risk.level}
                    </Text>
                  ))}
                </View>
              )}

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
,

  osHero: {
    backgroundColor: "#0F172A",
    borderRadius: 24,
    padding: 22,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: "#1E293B"
  },
  osEyebrow: {
    color: "#38BDF8",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 6
  },
  osTitle: {
    color: "#FFFFFF",
    fontSize: 26,
    fontWeight: "900",
    marginBottom: 6
  },
  osSubtitle: {
    color: "#CBD5E1",
    fontSize: 15,
    lineHeight: 22
  },
  kpiGrid: {
    display: "flex",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 18
  },
  kpiCard: {
    backgroundColor: "#EEF6FF",
    borderRadius: 18,
    padding: 16,
    minWidth: "45%",
    flexGrow: 1,
    borderWidth: 1,
    borderColor: "#BFDBFE"
  },
  kpiLabel: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 6,
    textTransform: "uppercase"
  },
  kpiValue: {
    color: "#0F172A",
    fontSize: 28,
    fontWeight: "900"
  },
  sectionHeader: {
    backgroundColor: "#F8FAFC",
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0"
  },
  sectionTitle: {
    color: "#0F172A",
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 6
  },
  sectionText: {
    color: "#475569",
    fontSize: 14,
    lineHeight: 20
  },
});
