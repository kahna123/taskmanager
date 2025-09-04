// server/server.js
import express from "express";
import http from "http";
import { Server } from "socket.io";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";

import taskRoutes from "./routes/taskRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import Notification from "./models/Notification.js";

dotenv.config();

const app = express();
const server = http.createServer(app);

// Socket.io setup
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

let onlineUsers = {}; // { userId: socketId }

io.on("connection", (socket) => {
  console.log("🔌 New client connected:", socket.id);

  socket.on("register", (userId) => {
    onlineUsers[userId] = socket.id;
    console.log("✅ User registered:", userId);
  });

  socket.on("disconnect", () => {
    for (let userId in onlineUsers) {
      if (onlineUsers[userId] === socket.id) {
        delete onlineUsers[userId];
        console.log("❌ Userr disconnected:", userId);
      }
    }
  });
});

// Helper function: store + send notification
export const sendNotification = async (userId, message, taskId = null) => {
  try {
    if (!userId) {
      console.warn("⚠️ No userId provided for notification");
      return;
    }

    // 1️⃣ Store in DB
    const notification = new Notification({
      user: userId,
      message,
      task: taskId,
    });
    await notification.save();

    // 2️⃣ Emit via socket
    const socketId = onlineUsers[userId];
    if (socketId) {
      io.to(socketId).emit("notification", notification);
      console.log("✅ Notification sent to user:", userId);
    } else {
      console.log("📡 User offline, notification stored:", userId);
    }
  } catch (err) {
    console.error("❌ Error sending notification:", err.message);
  }
};

app.use(cors());
app.use(express.json());

// Routes
app.use("/api/tasks", taskRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);

// Notification fetch route
app.get("/api/notifications/:userId", async (req, res) => {
  try {
    const notifications = await Notification.find({ 
      user: req.params.userId 
    }).sort({ createdAt: -1 });
    res.json(notifications);
  } catch (err) {
    console.error("Error fetching notifications:", err);
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

// Mark all notifications as read
app.patch("/api/notifications/:userId/mark-read", async (req, res) => {
  try {
    const result = await Notification.updateMany(
      { user: req.params.userId, isRead: false },
      { isRead: true }
    );
    
    res.json({ 
      success: true, 
      message: `${result.modifiedCount} notifications marked as read`,
      modifiedCount: result.modifiedCount
    });
  } catch (err) {
    console.error("Error marking notifications as read:", err);
    res.status(500).json({ error: "Failed to mark notifications as read" });
  }
});

// Mark single notification as read
app.patch("/api/notifications/:userId/:notificationId/read", async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { 
        _id: req.params.notificationId, 
        user: req.params.userId,
        isRead: false 
      },
      { isRead: true },
      { new: true }
    );
    
    if (!notification) {
      return res.status(404).json({ error: "Notification not found or already read" });
    }
    
    res.json({ success: true, notification });
  } catch (err) {
    console.error("Error marking notification as read:", err);
    res.status(500).json({ error: "Failed to mark notification as read" });
  }
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date() });
});

// MongoDB connection
mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/taskmanager")
  .then(() => {
    console.log("✅ MongoDB connected");
    server.listen(process.env.PORT || 5000, () => {
      console.log(`🚀 Server running on port ${process.env.PORT || 5000}`);
    });
  })
  .catch((err) => {
    console.error("❌ MongoDB connection failed:", err);
  });

export { io };