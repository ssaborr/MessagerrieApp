const express=require("express")
const mongoose=require("mongoose")
require('dotenv').config();
const  {User} = require("./models/Users");
const  {Conversation} = require("./models/Conversation");
const  {Message} = require("./models/Message");
const  {ContactRequest} = require("./models/ContactRequest");
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const cors=require("cors")
const app=express()
mongoose.connect("mongodb://localhost:27017/comapp") .then(() => console.log("MongoDB connected"))
  .catch(err => console.log(err));
app.use(express.json())
const mqtt = require('mqtt');
const mqttClient = mqtt.connect('wss://broker.hivemq.com:8000/mqtt');


mqttClient.on('message', async (topic, payload) => {
  try {
    const messageData = JSON.parse(payload.toString());
    const conversation = await Conversation.findById(messageData.conversationId);
    if (!conversation) return console.warn('Conversation not found for MQTT message');

    const senderStr = String(messageData.senderId);
    const isParticipant = conversation.participants.some(p => String(p) === senderStr);
    if (!isParticipant) {
      return console.warn('Sender not a participant', messageData.senderId);
    }

    await Message.create({
      conversationId: messageData.conversationId,
      senderId: messageData.senderId,
      encryptedMessage: messageData.encryptedMessage
    });
    console.log('Message saved from MQTT');
  } catch (err) {
    console.error('Failed to process MQTT message', err);
  }
});


const corsOptions = {
  origin: 'http://localhost:4200',
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  credentials: true,
  allowedHeaders: 'Content-Type,Authorization'
};

app.use(cors(corsOptions));

const presenceLastSeen = new Map();

app.post('/presence/heartbeat', authMiddleware, (req, res) => {
  const userId = String(req.userId);
  presenceLastSeen.set(userId, Date.now());
  res.sendStatus(200);
});

app.get('/presence/online', authMiddleware, (req, res) => {
  const now = Date.now();
  const ONLINE_MS = 55000;
  const online = [];
  for (const [userId, lastSeen] of presenceLastSeen.entries()) {
    if (now - lastSeen < ONLINE_MS) online.push(String(userId));
  }
  res.json(online);
});

function generateTopic(userA, userB) {
  const data = [userA.toString(), userB.toString()].sort().join(':');

  return 'chat/' + crypto
    .createHmac('sha256', process.env.TOPIC_SECRET)
    .update(data)
    .digest('hex');
}



app.get("/users", authMiddleware, async (req, res) => {
  try {
    const search = (req.query.search || '').trim();
    const filter = {};
    if (search) {
      filter.identifiant = { $regex: search, $options: 'i' };
    }
    const users = await User.find(filter).select('_id identifiant').lean();
    res.json(users.map(u => ({ _id: String(u._id), identifiant: u.identifiant })));
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.post('/contacts/request', authMiddleware, async (req, res) => {
  try {
    const fromId = req.userId;
    const toId = req.body.toUserId;
    if (!toId || String(toId) === String(fromId)) {
      return res.status(400).json({ message: 'Invalid user' });
    }

    // Check if already contacts
    const accepted = await ContactRequest.findOne({
      $or: [
        { fromUser: fromId, toUser: toId, status: 'accepted' },
        { fromUser: toId, toUser: fromId, status: 'accepted' }
      ]
    });
    if (accepted) {
      return res.status(400).json({ message: 'Already contacts' });
    }

    // Check if pending request already sent by me
    const pendingSent = await ContactRequest.findOne({
      fromUser: fromId,
      toUser: toId,
      status: 'pending'
    });
    if (pendingSent) {
      return res.status(400).json({ message: 'Request already sent' });
    }

    // Check if they sent me a pending request
    const pendingReceived = await ContactRequest.findOne({
      fromUser: toId,
      toUser: fromId,
      status: 'pending'
    });
    if (pendingReceived) {
      return res.status(400).json({ message: 'They already sent you a request' });
    }

    // Check if rejected - if so, update to pending (allow resending)
    const rejected = await ContactRequest.findOne({
      fromUser: fromId,
      toUser: toId,
      status: 'rejected'
    });
    if (rejected) {
      rejected.status = 'pending';
      rejected.createdAt = new Date();
      await rejected.save();
      return res.status(200).json({ message: 'Request resent' });
    }

    // Create new request
    await ContactRequest.create({ fromUser: fromId, toUser: toId, status: 'pending' });
    res.status(201).json({ message: 'Request sent' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Incoming contact requests (for notifications)
app.get('/contacts/requests', authMiddleware, async (req, res) => {
  try {
    const list = await ContactRequest.find({ toUser: req.userId, status: 'pending' })
      .populate('fromUser', 'identifiant _id')
      .lean()
      .sort({ createdAt: -1 });
    const valid = list.filter(r => r.fromUser && r.fromUser.identifiant);
    res.json(valid.map(r => ({
      _id: String(r._id),
      fromUser: { _id: String(r.fromUser._id), identifiant: r.fromUser.identifiant },
      createdAt: r.createdAt
    })));
  } catch (err) {
    console.error('Error loading contact requests:', err);
    res.status(500).json({ message: err.message });
  }
});

app.post('/contacts/requests/:id/accept', authMiddleware, async (req, res) => {
  try {
    const reqId = req.params.id;
    const doc = await ContactRequest.findOne({ _id: reqId, toUser: req.userId, status: 'pending' });
    if (!doc) return res.status(404).json({ message: 'Request not found' });
    doc.status = 'accepted';
    await doc.save();
    res.json({ message: 'Accepted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/contacts/requests/:id/reject', authMiddleware, async (req, res) => {
  try {
    const doc = await ContactRequest.findOneAndUpdate(
      { _id: req.params.id, toUser: req.userId, status: 'pending' },
      { status: 'rejected' }
    );
    if (!doc) return res.status(404).json({ message: 'Request not found' });
    res.json({ message: 'Rejected' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('/contacts', authMiddleware, async (req, res) => {
  try {
    const me = req.userId;
    const list = await ContactRequest.find({
      $or: [{ fromUser: me }, { toUser: me }],
      status: 'accepted'
    }).lean();
    const otherIds = list.map(r => {
      const from = String(r.fromUser);
      const to = String(r.toUser);
      return from === String(me) ? to : from;
    });
    if (otherIds.length === 0) {
      return res.json([]);
    }
    const users = await User.find({ _id: { $in: otherIds } }).select('_id identifiant').lean();
    res.json(users.map(u => ({ _id: String(u._id), identifiant: u.identifiant })));
  } catch (err) {
    console.error(err);
    res.status(500).send(err.message);
  }
});

app.get('/contacts/sent', authMiddleware, async (req, res) => {
  try {
    const list = await ContactRequest.find({ fromUser: req.userId, status: 'pending' }).select('toUser').lean();
    res.json(list.map(r => String(r.toUser)));
  } catch (err) {
    res.status(500).send(err.message);
  }
});

  
const bcrypt = require('bcrypt');

app.post('/login', async (req, res) => {
  const { identifiant, password } = req.body;

  const user = await User.findOne({ identifiant });
  if (!user) return res.status(401).json({ message: 'Invalid credentials' });

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });

  const jwtToken = jwt.sign(
    { userId: user._id, identifiant: user.identifiant, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '2h' }
  );

  res.json({
    token: jwtToken,
    encryptedPrivateKey: user.encryptedPrivateKey,
    iv: user.iv,
    salt: user.salt,
    publicKey: user.publicKey
  });
});


app.post('/sign', async (req, res) => {
  try {
    const {
      identifiant,
      password,
      role,
      publicKey,
      encryptedPrivateKey,
      iv,
      salt
    } = req.body;

    if (!identifiant || !password || !publicKey || !encryptedPrivateKey || !iv || !salt) {
      return res.status(400).json({ message: 'Missing fields' });
    }

    const existingUser = await User.findOne({ identifiant });
    if (existingUser) return res.status(409).json({ message: 'User exists' });

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      identifiant,
      password: hashedPassword,
      role: role || 0,
      publicKey,
      encryptedPrivateKey,
      iv,
      salt
    });

    await newUser.save();

    const jwtToken = jwt.sign(
      { userId: newUser._id, identifiant: newUser.identifiant, role: newUser.role },
      process.env.JWT_SECRET,
      { expiresIn: '2h' }
    );

    res.status(201).json({ token: jwtToken, message: 'User created successfully' });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});


function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'No token' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch {
    res.status(401).json({ message: 'Invalid token' });
  }
}



function generateConversationKey() {
  return crypto.randomBytes(32);
}

function encryptWithPublicKey(aesKeyBuffer, publicKeyPem) {
  const encrypted = crypto.publicEncrypt(
    {
      key: publicKeyPem,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256'
    },
    aesKeyBuffer
  );
  return encrypted.toString('base64');
}

app.post('/conversations', authMiddleware, async (req, res) => {
  try {
    const { receiverId } = req.body;
    const senderId = req.userId;
    const sid = String(senderId);
    const rid = String(receiverId);

    const pid1 = mongoose.Types.ObjectId.isValid(senderId) ? new mongoose.Types.ObjectId(senderId) : senderId;
    const pid2 = mongoose.Types.ObjectId.isValid(receiverId) ? new mongoose.Types.ObjectId(receiverId) : receiverId;
    let conversation = await Conversation.findOne({
      participants: { $all: [pid1, pid2] }
    });

    if (conversation) {
      mqttClient.subscribe(conversation.topic, () => {});
      const encKey = conversation.keys && (typeof conversation.keys.get === 'function' ? conversation.keys.get(sid) : conversation.keys[sid]);
      return res.json({
        conversationId: conversation._id,
        topic: conversation.topic,
        encryptedKey: encKey || ''
      });
    }

    const convKey = generateConversationKey();
    const sender = await User.findById(senderId);
    const receiver = await User.findById(receiverId);
    if (!sender || !receiver) return res.status(400).json({ message: 'User not found' });

    const encryptedKeyForSender = encryptWithPublicKey(convKey, sender.publicKey);
    const encryptedKeyForReceiver = encryptWithPublicKey(convKey, receiver.publicKey);
    const topic = generateTopic(senderId, receiverId);

    conversation = new Conversation({
      participants: [senderId, receiverId],
      topic,
      keys: { [sid]: encryptedKeyForSender, [rid]: encryptedKeyForReceiver }
    });
    await conversation.save();

    mqttClient.subscribe(topic, (err) => {
      if (err) console.error('Subscribe failed', topic, err);
    });

    res.json({
      conversationId: conversation._id,
      topic,
      encryptedKey: encryptedKeyForSender
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('/conversations', authMiddleware, async (req, res) => {
  const conversations = await Conversation.find({
    participants: req.userId
  }).populate('participants', 'identifiant _id').lean();

  const result = conversations.map(conv => {
    const otherParticipant = conv.participants.find(p => String(p._id) !== String(req.userId));
    return {
      _id: String(conv._id),
      topic: conv.topic,
      otherParticipant: otherParticipant ? {
        _id: String(otherParticipant._id),
        identifiant: otherParticipant.identifiant
      } : null
    };
  });

  res.json(result);
});




app.post('/messages', authMiddleware, async (req, res) => {
  const { conversationId, encryptedMessage } = req.body;

  await Message.create({
    conversationId,
    senderId: req.userId,
    encryptedMessage
  });

  res.sendStatus(201);
});



app.get('/messages/:conversationId', authMiddleware, async (req, res) => {
  const messages = await Message.find({
    conversationId: req.params.conversationId
  })
    .sort({ createdAt: 1 })
    .lean();
  res.json(messages.map(m => ({
    _id: String(m._id),
    conversationId: String(m.conversationId),
    senderId: String(m.senderId),
    encryptedMessage: m.encryptedMessage,
    createdAt: m.createdAt
  })));
});








app.listen(3000,()=>console.log("server running 3000"))