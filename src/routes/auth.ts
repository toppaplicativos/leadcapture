import { Router, Request, Response } from "express";
import { UsersService } from "../services/users";
import { authMiddleware, AuthRequest, requireRole } from "../middleware/auth";
import { logger } from "../utils/logger";

const router = Router();
const usersService = new UsersService();

// POST /api/auth/register
router.post("/register", async (req: Request, res: Response) => {
  try {
    const { email, password, name, phone, role } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: "Email, password and name are required" });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const user = await usersService.create({ email, password, name, phone, role });
    
    // Auto-login after registration
    const loginResult = await usersService.login({ email, password });

    res.status(201).json({
      success: true,
      message: "User registered successfully",
      token: loginResult.token,
      user: loginResult.user,
    });
  } catch (error: any) {
    logger.error(`Registration error: ${error.message}`);
    if (error.message === "Email already registered") {
      return res.status(409).json({ error: error.message });
    }
    res.status(500).json({ error: "Registration failed" });
  }
});

// POST /api/auth/login
router.post("/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const result = await usersService.login({ email, password });

    res.json({
      success: true,
      token: result.token,
      user: result.user,
    });
  } catch (error: any) {
    logger.error(`Login error: ${error.message}`);
    if (error.message === "Invalid credentials") {
      return res.status(401).json({ error: "Invalid email or password" });
    }
    res.status(500).json({ error: "Login failed" });
  }
});

// GET /api/auth/me - Get current user profile
router.get("/me", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const user = await usersService.getById(req.user!.userId as any);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json({ success: true, user });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/auth/me - Update current user profile
router.put("/me", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { name, email, phone, password } = req.body;
    const user = await usersService.updateUser(req.user!.userId as any, {
      name, email, phone, password,
    });
    res.json({ success: true, user });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/auth/users - List all users (admin only)
router.get("/users", authMiddleware, requireRole(["admin"]), async (req: AuthRequest, res: Response) => {
  try {
    const users = await usersService.getAll();
    res.json({ success: true, users });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/auth/users/:id - Update user (admin only)
router.put("/users/:id", authMiddleware, requireRole(["admin"]), async (req: AuthRequest, res: Response) => {
  try {
    const { name, email, phone, role, password } = req.body;
    const user = await usersService.updateUser(req.params.id as string, {
      name, email, phone, role, password,
    });
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ success: true, user });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/auth/users/:id - Deactivate user (admin only)
router.delete("/users/:id", authMiddleware, requireRole(["admin"]), async (req: AuthRequest, res: Response) => {
  try {
    const success = await usersService.deactivate(req.params.id as string);
    if (!success) return res.status(404).json({ error: "User not found" });
    res.json({ success: true, message: "User deactivated" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

