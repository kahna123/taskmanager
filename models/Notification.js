// server/models/Notification.js
import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    user: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User", 
      required: true 
    },
    message: { 
      type: String, 
      required: true,
      maxlength: 500
    },
    isRead: { 
      type: Boolean, 
      default: false 
    },
    task: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "Task", 
      default: null 
    },
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Add indexes
notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ isRead: 1 });
notificationSchema.index({ task: 1 });

export default mongoose.model("Notification", notificationSchema);