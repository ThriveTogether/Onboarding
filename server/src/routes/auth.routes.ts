import { Router, Request, Response } from 'express';
import { User } from '../models/User';
import { OnboardingCompany } from '../models/OnboardingCompany';
import {
  hashPassword,
  verifyPassword,
  signToken,
  validateEmail,
  validatePassword,
} from '../services/auth/authService';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.post('/signup', async (req: Request, res: Response) => {
  const { email, password, companyName, name } = req.body as {
    email?: string;
    password?: string;
    companyName?: string;
    name?: string;
  };

  const emailError = validateEmail(email || '');
  if (emailError) return res.status(400).json({ error: emailError });
  const passwordError = validatePassword(password || '');
  if (passwordError) return res.status(400).json({ error: passwordError });
  if (!companyName || !companyName.trim()) {
    return res.status(400).json({ error: 'Company name is required' });
  }

  const normalisedEmail = email!.toLowerCase().trim();
  const existing = await User.findOne({ email: normalisedEmail });
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists. Try logging in.' });
  }

  const passwordHash = await hashPassword(password!);
  const user = await User.create({
    email: normalisedEmail,
    passwordHash,
    name: (name || '').trim(),
    companyName: companyName.trim(),
    companyId: null,
    lastLoginAt: new Date(),
  });

  const token = signToken({
    userId: user._id.toString(),
    email: user.email,
    companyId: null,
  });

  return res.status(201).json({
    token,
    user: {
      _id: user._id,
      email: user.email,
      name: user.name,
      companyName: user.companyName,
      companyId: null,
    },
  });
});

router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const user = await User.findOne({ email: email.toLowerCase().trim() });
  if (!user) return res.status(401).json({ error: 'Invalid email or password' });

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Invalid email or password' });

  user.lastLoginAt = new Date();
  await user.save();

  const token = signToken({
    userId: user._id.toString(),
    email: user.email,
    companyId: user.companyId?.toString() || null,
  });

  return res.json({
    token,
    user: {
      _id: user._id,
      email: user.email,
      name: user.name,
      companyName: user.companyName,
      companyId: user.companyId,
    },
  });
});

router.get('/me', authMiddleware, async (req: Request, res: Response) => {
  const user = await User.findById(req.user!.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  // Also fetch the company if linked
  const company = user.companyId ? await OnboardingCompany.findById(user.companyId) : null;

  return res.json({
    user: {
      _id: user._id,
      email: user.email,
      name: user.name,
      companyName: user.companyName,
      companyId: user.companyId,
    },
    company,
  });
});

export default router;
