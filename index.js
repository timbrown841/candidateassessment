require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();   // ✅ app is created HERE

app.use(cors({          // 2️⃣ middleware
  origin: 'https://timbrown841.github.io'
}));

app.use(express.json());  // 3️⃣ middleware

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
app.post('/api/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return res.status(400).json({ error: 'User already exists' });
  }

  const newUser = new User({ name, email, password });
  await newUser.save();
  res.json({ message: 'User registered successfully' });
});

// ✅ Login API
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email, password });
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
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
    starter: 'price_1RoZjT0VW0HuFulYe6OE9GLr',
    professional: 'price_1RoZkC0VW0HuFulYIm5DEjaR',
    enterprise: 'price_1RoZlu0VW0HuFulYxn6cwYeA'
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
      success_url: 'https://your-frontend-domain.com/success.html',
      cancel_url: 'https://your-frontend-domain.com/cancel.html'
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



