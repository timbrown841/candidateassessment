const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const app = express(); // ✅ Moved here before app.use()
const axios = require('axios');
const crypto = require('crypto');
const bcrypt = require('bcrypt');

require('dotenv').config();
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "admin-secret-token";
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// 2️⃣ middleware
app.use(cors({
  origin: 'https://timbrown841.github.io',
  credentials: false
}));
app.use(express.json()); 

// ✅ MongoDB connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('✅ Connected to MongoDB'))
.catch(err => console.error('❌ MongoDB connection error:', err));

// ✅ Question model
const questionSchema = new mongoose.Schema({
  role: String,
  question: String,
  options: [String],
  correctAnswer: String,
  image: String, // optional image URL
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client' }
});

const Question = mongoose.model('Question', questionSchema);

// ✅ MongoDB Client Model
const clientSchema = new mongoose.Schema({
  name: String,
  email: String,
  logoUrl: String,
  primaryColor: String,
  secondaryColor: String,
  instructions: String,
  customLink: String,
  questionBank: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Question' }]
});

const Client = mongoose.model('Client', clientSchema);

// ✅ User Schema and Model
const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  password: String,
  isVerified: { type: Boolean, default: false },
  verifyToken: String,
  resetToken: String,                // ✅ for password reset
  resetTokenExpiry: Date,            // ✅ token expiration (e.g. 1 hour)
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client' }
});

const User = mongoose.model('User', userSchema);

// ✅ Submission Schema
const submissionSchema = new mongoose.Schema({
  name: String,
  email: String,
  role: String,
  responses: Array,
  date: { type: Date, default: Date.now }
});

const Submission = mongoose.model('Submission', submissionSchema);

// ✅ Request Password Reset
app.post('/api/request-password-reset', async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });

  if (!user) return res.status(400).json({ error: 'User not found' });

  const token = crypto.randomBytes(32).toString('hex');
  user.resetToken = token;
  user.resetTokenExpiry = Date.now() + 3600000; // 1 hour
  await user.save();

  const resetLink = `https://timbrown841.github.io/candidateassessment/reset-password.html?token=${token}`;

  try {
    await axios.post('https://api.brevo.com/v3/smtp/email', {
      sender: {
        name: 'Candidate Assessment',
        email: 'treybl841@gmail.com'
      },
      to: [{ email, name: user.name }],
      subject: 'Password Reset Request',
      htmlContent: `
        <p>Hi ${user.name},</p>
        <p>Click <a href="${resetLink}">here to reset your password</a>. This link will expire in 1 hour.</p>
      `
    }, {
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json'
      }
    });

    res.json({ message: '✅ Password reset link sent' });
  } catch (err) {
    console.error('❌ Brevo error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to send email' });
  }
});

// ✅ Validate reset token and return email
app.get('/api/validate-reset-token', async (req, res) => {
  const { token } = req.query;

  const user = await User.findOne({
    resetToken: token,
    resetTokenExpiry: { $gt: Date.now() }
  });

  if (!user) {
    return res.status(400).json({ error: 'Invalid or expired token' });
  }

  res.json({ email: user.email });
});

// ✅ Reset Password
app.post('/api/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;

  const user = await User.findOne({
    resetToken: token,
    resetTokenExpiry: { $gt: Date.now() }
  });

  if (!user) return res.status(400).json({ error: 'Invalid or expired token' });

  const hashed = await bcrypt.hash(newPassword, 10);
  user.password = hashed;
  user.resetToken = undefined;
  user.resetTokenExpiry = undefined;
  await user.save();

  res.json({ message: '✅ Password reset successfully' });
});

// ✅ Registration API
app.post('/api/register', async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) return res.status(400).json({ error: 'All fields are required' });

  const existingUser = await User.findOne({ email });
  if (existingUser) return res.status(400).json({ error: 'User already exists' });

  const verifyToken = crypto.randomBytes(32).toString('hex');

  const hashedPassword = await bcrypt.hash(password, 10);
  
  const DEFAULT_CLIENT_ID = process.env.DEFAULT_CLIENT_ID;

const newUser = new User({
  name,
  email,
  password: hashedPassword,
  verifyToken,
  clientId: DEFAULT_CLIENT_ID
});

  await newUser.save();

  const verifyUrl = `https://candidateassessment.onrender.com/api/verify-email?token=${verifyToken}`;

  try {
    await axios.post('https://api.brevo.com/v3/smtp/email', {
      sender: {
        name: 'Candidate Assessment',
        email: 'treybl841@gmail.com' // Verified sender in Brevo
      },
      to: [{ email, name }],
      subject: 'Verify Your Email Address',
      htmlContent: `
        <p>Hi ${name},</p>
        <p>Thanks for registering. Please <a href="${verifyUrl}">click here to verify your email</a>.</p>
        <p>If you did not sign up, ignore this email.</p>
      `
    }, {
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json'
      }
    });

    res.json({ message: '✅ Registration successful. Please verify your email.' });
  } catch (err) {
    console.error('❌ Brevo email error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to send verification email.' });
  }
});

// ✅ Verify email
app.get('/api/verify-email', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).send('Invalid verification link');

  const user = await User.findOne({ verifyToken: token });

  if (!user) {
    return res.status(400).send('Invalid or expired verification link');
  }

  user.isVerified = true;
  user.verifyToken = undefined;
  await user.save();

  res.redirect('https://timbrown841.github.io/candidateassessment/verified.html');
});

// ✅ Login API
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email });
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  if (!user.isVerified) {
    return res.status(403).json({ error: 'Email not verified' });
  }

  res.json({
  message: 'Login successful',
  user: {
    _id: user._id,
    name: user.name,
    email: user.email,
    clientId: user.clientId
  }
});
  
});

// ✅ Serve Branding to Frontend
app.get('/api/client/:clientId', async (req, res) => {
  const client = await Client.findById(req.params.clientId);
  if (!client) return res.status(404).json({ error: 'Client not found' });
  res.json(client);
});

// ✅ Submit Assessment API
app.post('/api/submit', async (req, res) => {
  const { name, email, role, responses } = req.body;
  if (!name || !email || !role || !responses) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  const submission = new Submission({ name, email, role, responses });
  await submission.save();
  res.json({ message: 'Assessment submitted successfully' });
});

// ✅ Admin Login Route
const jwt = require('jsonwebtoken');

app.post('/api/admin/login', async (req, res) => {
  const { username, password } = req.body;

  if (username !== process.env.ADMIN_USERNAME) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const isValid = await bcrypt.compare(
    password,
    process.env.ADMIN_PASSWORD_HASH
  );

  if (!isValid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign(
    { role: 'admin' },
    process.env.ADMIN_JWT_SECRET,
    { expiresIn: '2h' }
  );

  res.json({ token });
});

// ✅ Protect Admin Routes With Middleware
function requireAdmin(req, res, next) {
  const auth = req.headers.authorization;

  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const token = auth.split(' ')[1];
    const decoded = jwt.verify(token, process.env.ADMIN_JWT_SECRET);

    if (decoded.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ✅ Admin API (fetch all submissions)
app.get('/api/submissions', requireAdmin, async (req, res) => {
  try {
    const submissions = await Submission.find().sort({ date: -1 });
    res.json(submissions);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ✅ Fetch a single submission by ID (admin only)
app.get('/api/submission/:id', requireAdmin, async (req, res) => {
  try {
    const submission = await Submission.findById(req.params.id);
    if (!submission) return res.status(404).json({ error: "Not found" });
    res.json(submission);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ✅ API to Fetch Questions for Logged-in User
app.get('/api/questions/:role/:clientId', async (req, res) => {
  const { role, clientId } = req.params;
  const questions = await Question.find({ clientId, role });
  res.json(questions);
});

// ✅ Stripe Checkout API
app.post('/api/checkout', async (req, res) => {
  const { plan } = req.body;

  const prices = {
    starter: 'price_1SkVFH1L3l4aj3goKdncyatc',
    professional: 'price_1SkVG51L3l4aj3golaTs6ufC',
    enterprise: 'price_1SkVPF1L3l4aj3gozeEvIYQv'
  };

  if (!prices[plan]) {
    return res.status(400).json({ error: 'Invalid plan selected' });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [
        {
          price: prices[plan],
          quantity: 1
        }
      ],
      success_url: 'https://timbrown841.github.io/candidateassessment/success.html',
      cancel_url: 'https://timbrown841.github.io/candidateassessment/cancel.html'
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('Stripe error:', err);
    res.status(500).json({ error: 'Stripe checkout failed' });
  }
});

// ✅ Contact Schema
const contactSchema = new mongoose.Schema({
  name: String,
  email: String,
  company: String,
  message: String,
  date: { type: Date, default: Date.now }
});
const Contact = mongoose.model('Contact', contactSchema);

// ✅ Contact Form API
app.post('/api/contact', async (req, res) => {
  const { name, email, company, message } = req.body;
  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  try {
    await Contact.create({ name, email, company, message });
    res.json({ message: 'Inquiry submitted successfully' });
  } catch (error) {
    console.error('Contact error:', error);
    res.status(500).json({ error: 'Failed to save contact inquiry' });
  }
});


// ✅ Start server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});





