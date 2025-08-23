// server/middleware/auth.js
import jwt from "jsonwebtoken";

export function auth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    
    if (!header.startsWith("Bearer ")) {
      return res.status(401).json({ message: "No token provided" });
    }
    
    const token = header.split(" ")[1];
    
    if (!token) {
      return res.status(401).json({ message: "No token provided" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || "your-secret-key");
    req.userId = decoded.id;
    
    // Also add user object for convenience
    req.user = { id: decoded.id };
    
    next();
  } catch (e) {
    console.error("Auth middleware error:", e.message);
    return res.status(401).json({ message: "Invalid token" });
  }
}

export default auth;