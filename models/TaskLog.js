// server/models/TaskLog.js
import mongoose from "mongoose";

const taskLogSchema = new mongoose.Schema(
  {
    taskId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "Task", 
      required: true 
    },
    action: { 
      type: String, 
      required: true,
      maxlength: 100
    },
    performedBy: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User", 
      required: true 
    },
    details: { 
      type: String, 
      default: "",
      maxlength: 500
    }
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Add indexes
taskLogSchema.index({ taskId: 1, createdAt: -1 });
taskLogSchema.index({ performedBy: 1 });

export default mongoose.model("TaskLog", taskLogSchema);