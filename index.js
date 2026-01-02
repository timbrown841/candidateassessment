const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const app = express(); // ✅ Moved here before app.use()
const axios = require('axios');
const crypto = require('crypto');

require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// 2️⃣ middleware
app.use(cors({
  origin: 'https://timbrown841.github.io'
}));
app.use(express.json()); 

// ✅ MongoDB connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('✅ Connected to MongoDB'))
.catch(err => console.error('❌ MongoDB connection error:', err));

// ✅ User Schema and Model
const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  password: String
  isVerified: { type: Boolean, default: false },
  verifyToken: String
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

// ✅ Registration API
const crypto = require('crypto');
const nodemailer = require('nodemailer');

app.post('/api/register', async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) return res.status(400).json({ error: 'All fields are required' });

  const existingUser = await User.findOne({ email });
  if (existingUser) return res.status(400).json({ error: 'User already exists' });

  const verifyToken = crypto.randomBytes(32).toString('hex');

  const newUser = new User({ name, email, password, verifyToken });
  await newUser.save();

  const verifyUrl = `https://candidateassessment.onrender.com/api/verify-email?token=${verifyToken}`;

  try {
    await axios.post('https://api.brevo.com/v3/smtp/email', {
      sender: {
        name: 'Candidate Assessment',
        email: 'no-reply@candidateassessment.com' // Verified sender in Brevo
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

  const verifyUrl = `https://candidateassessment.onrender.com/api/verify-email?token=${verifyToken}`;
  const mailOptions = {
    from: `"Candidate Assessment" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Verify your email',
    html: `<p>Hi ${name},</p><p>Please <a href="${verifyUrl}">verify your email</a> to activate your account.</p>`
  };

  transporter.sendMail(mailOptions, (err, info) => {
    if (err) {
      console.error('Email send error:', err);
      return res.status(500).json({ error: 'Failed to send verification email' });
    }
    res.json({ message: 'Registration successful. Please check your email to verify your account.' });
  });
});

// ✅ Verify email
app.get('/api/verify-email', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).send('Invalid verification link');

  const user = await User.findOne({ verifyToken: token });
  if (!user) return res.status(400).send('Invalid or expired verification link');

  user.isVerified = true;
  user.verifyToken = undefined;
  await user.save();

  res.send('✅ Email verified. You can now log in.');
});

// ✅ Login API
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email, password });

  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  if (!user.isVerified) return res.status(403).json({ error: 'Email not verified' });

  res.json({ message: 'Login successful', user });
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

// ✅ Admin API (fetch all submissions)
app.get('/api/submissions', async (req, res) => {
  try {
    const all = await Submission.find().sort({ submittedAt: -1 });
    res.json(all);
  } catch (err) {
    res.status(500).json({ message: 'Server error loading submissions' });
  }
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

// Contact Schema
const contactSchema = new mongoose.Schema({
  name: String,
  email: String,
  company: String,
  message: String,
  date: { type: Date, default: Date.now }
});
const Contact = mongoose.model('Contact', contactSchema);

// Contact Form API
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

