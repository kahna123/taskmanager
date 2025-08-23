// server/routes/taskRoutes.js
import express from "express";
import { auth } from "../middleware/auth.js";
import Task from "../models/Task.js";
import TaskLog from "../models/TaskLog.js";
import { sendNotification } from "../server.js";

const router = express.Router();

// 🟢 Create Task
router.post("/", auth, async (req, res) => {
  try {
    const { title, description, priority, status, dueDate, assignedTo } = req.body;

    if (!title) {
      return res.status(400).json({ message: "Title is required" });
    }

    const task = await Task.create({
      title,
      description: description || "",
      priority: priority || "Medium",
      status: status || "Pending",
      dueDate: dueDate || null,
      assignedTo: assignedTo || null,
      createdBy: req.userId,
    });

    // Populate the created task
    const populatedTask = await Task.findById(task._id)
      .populate("createdBy", "username email")
      .populate("assignedTo", "username email");

    // Create activity log
    await TaskLog.create({
      taskId: task._id,
      action: "Task Created",
      performedBy: req.userId,
      details: `Task "${title}" was created`,
    });

    // Send notification to assigned user
    if (assignedTo && assignedTo !== req.userId) {
      await sendNotification(
        assignedTo,
        `📌 New Task Assigned: ${title}`,
        task._id
      );
    }

    res.json({ success: true, task: populatedTask });
  } catch (err) {
    console.error("Error creating task:", err);
    res.status(500).json({ message: err.message });
  }
});

// 🟢 Get My Tasks (created & assigned) with filters
router.get("/my-tasks", auth, async (req, res) => {
  try {
    const { filter, status, priority, q } = req.query;
    
    let query = {};

    // Filter by scope
    if (filter === "created") {
      query.createdBy = req.userId;
    } else if (filter === "assigned") {
      query.assignedTo = req.userId;
    } else {
      // Show all tasks (created by user OR assigned to user)
      query.$or = [
        { createdBy: req.userId },
        { assignedTo: req.userId }
      ];
    }

    // Filter by status
    if (status && status !== "all") {
      query.status = status;
    }

    // Filter by priority
    if (priority && priority !== "all") {
      query.priority = priority;
    }

    // Search by title or description
    if (q) {
      query.$and = query.$and || [];
      query.$and.push({
        $or: [
          { title: { $regex: q, $options: "i" } },
          { description: { $regex: q, $options: "i" } }
        ]
      });
    }

    const tasks = await Task.find(query)
      .populate("createdBy", "username email")
      .populate("assignedTo", "username email")
      .sort({ createdAt: -1 });

    res.json(tasks);
  } catch (err) {
    console.error("Error fetching tasks:", err);
    res.status(500).json({ message: err.message });
  }
});

// 🟢 Update Task
router.put("/:id", auth, async (req, res) => {
  try {
    const { title, description, priority, status, dueDate, assignedTo } = req.body;
    
    const task = await Task.findById(req.params.id);
    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    // Check if user has permission to edit
    const canEdit = task.createdBy.toString() === req.userId || 
                   task.assignedTo?.toString() === req.userId;
    
    if (!canEdit) {
      return res.status(403).json({ message: "Not authorized to edit this task" });
    }

    // Track changes for notifications
    const oldStatus = task.status;
    const oldAssignedTo = task.assignedTo;
    const changes = [];

    // Update fields
    if (title !== undefined) {
      task.title = title;
      changes.push(`Title changed to "${title}"`);
    }
    if (description !== undefined) {
      task.description = description;
    }
    if (priority !== undefined) {
      task.priority = priority;
      changes.push(`Priority changed to ${priority}`);
    }
    if (status !== undefined && status !== oldStatus) {
      task.status = status;
      changes.push(`Status changed from ${oldStatus} to ${status}`);
    }
    if (dueDate !== undefined) {
      task.dueDate = dueDate;
    }
    if (assignedTo !== undefined) {
      task.assignedTo = assignedTo;
      if (assignedTo !== oldAssignedTo?.toString()) {
        changes.push(`Task reassigned`);
      }
    }

    await task.save();

    // Populate the updated task
    const updatedTask = await Task.findById(task._id)
      .populate("createdBy", "username email")
      .populate("assignedTo", "username email");

    // Create activity log
    await TaskLog.create({
      taskId: task._id,
      action: "Task Updated",
      performedBy: req.userId,
      details: changes.join(", "),
    });

    // Send notifications
    const notificationMessage = `🔄 Task Updated: ${task.title}`;
    
    // Notify creator (if not the one making the change)
    if (task.createdBy.toString() !== req.userId) {
      await sendNotification(task.createdBy, notificationMessage, task._id);
    }

    // Notify assigned user (if changed and not the one making the change)
    if (task.assignedTo && task.assignedTo.toString() !== req.userId) {
      await sendNotification(task.assignedTo, notificationMessage, task._id);
    }

    // If assignment changed, notify old assignee
    if (oldAssignedTo && 
        oldAssignedTo.toString() !== task.assignedTo?.toString() && 
        oldAssignedTo.toString() !== req.userId) {
      await sendNotification(
        oldAssignedTo, 
        `📤 Task Unassigned: ${task.title}`, 
        task._id
      );
    }

    res.json({ success: true, task: updatedTask });
  } catch (err) {
    console.error("Error updating task:", err);
    res.status(500).json({ message: err.message });
  }
});

// 🟢 Delete Task
router.delete("/:id", auth, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    // Check if user has permission to delete (only creator can delete)
    if (task.createdBy.toString() !== req.userId) {
      return res.status(403).json({ message: "Only task creator can delete this task" });
    }

    // Notify assigned user before deletion
    if (task.assignedTo && task.assignedTo.toString() !== req.userId) {
      await sendNotification(
        task.assignedTo,
        `🗑️ Task Deleted: ${task.title}`,
        task._id
      );
    }

    // Delete related logs
    await TaskLog.deleteMany({ taskId: task._id });
    
    // Delete the task
    await Task.findByIdAndDelete(req.params.id);

    res.json({ success: true, message: "Task deleted successfully" });
  } catch (err) {
    console.error("Error deleting task:", err);
    res.status(500).json({ message: err.message });
  }
});

// 🟢 Get Task Logs
router.get("/:id/logs", auth, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    // Check if user has access to view logs
    const hasAccess = task.createdBy.toString() === req.userId || 
                     task.assignedTo?.toString() === req.userId;
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Not authorized to view task logs" });
    }

    const logs = await TaskLog.find({ taskId: req.params.id })
      .populate("performedBy", "username email")
      .sort({ createdAt: -1 });

    res.json(logs);
  } catch (err) {
    console.error("Error fetching task logs:", err);
    res.status(500).json({ message: err.message });
  }
});

// 🟢 Get Single Task
router.get("/:id", auth, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id)
      .populate("createdBy", "username email")
      .populate("assignedTo", "username email");

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    // Check if user has access to view task
    const hasAccess = task.createdBy._id.toString() === req.userId || 
                     task.assignedTo?._id.toString() === req.userId;
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Not authorized to view this task" });
    }

    res.json(task);
  } catch (err) {
    console.error("Error fetching task:", err);
    res.status(500).json({ message: err.message });
  }
});

export default router;