const express = require('express');
const cors = require('cors');
const connectDB = require('./db');
const Session = require('./models/Session');
const User = require('./models/User');
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const app = express();
app.use(express.json());
app.use(cors());

connectDB();

const PORT = process.env.PORT || 0;
const server = app.listen(PORT, () => {
  console.log('server is running on port', PORT);
});

app.post('/create-session', async (req, res) => {
  const { title, userId } = req.body;
  if (!title || !userId) {
    return res.status(400).json({ error: 'Invalid title or user ID' });
  }

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User doesn't exist" });
    }

    const session = await Session.create({
      sessionId: uuidv4(),
      title: title,
      createdBy: userId,
      users: [userId],
      options: [],
      status: 'Pending',
    });

    user.createdSessions.push(session._id);
    await user.save();

    res.status(201).json({
      message: 'Session was created successfully',
      session,
      inviteLink: `http://localhost:3000/join/${session.sessionId}`,
    });
  } catch (error) {
    console.error('error creating session:', error);
    res
      .status(500)
      .json({ error: 'Server error occured while creating session' });
  }
});

app.post('/join-session', async (req, res) => {
  const { sessionId, userId } = req.body;

  try {
    if (!sessionId || !userId) {
      return res
        .status(400)
        .json({ error: 'sessionID and userID are required' });
    }

    const session = await Session.findById(sessionId);

    if (!session) {
      return res.status(404).json({ error: "Session doesn't exist" });
    }

    if (['Completed', 'Cancelled'].includes(session.status)) {
      return res.status(400).json({
        error: `Cannot join a ${session.status.toLowerCase()} session`,
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ error: "User doesn't exist" });
    }

    const isUserInSession = session.users.includes(userId);
    if (isUserInSession) {
      return res.status(400).json({ error: 'User is already in the session' });
    }

    session.users.push(userId);
    await session.save();

    user.joinedSessions.push(session._id);
    await user.save();

    return res
      .status(200)
      .json({ message: 'User successfully joined session', session });
  } catch (error) {
    console.error('A server error occured', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

app.post('/swipe-option', async (req, res) => {
  const { sessionId, userId, optionId, swipeAction } = req.body;

  if (!sessionId || !userId || !optionId || !swipeAction) {
    return res.status(400).json({
      error: 'session ID, user ID, option ID and swipe action are required',
    });
  }

  try {
    const session = await Session.findById(sessionId);

    if (!session) {
      return res.status(404).json({ error: "Session doesn't exist" });
    }

    const user = session.users.find((user) =>
      user.equals(new mongoose.Types.ObjectId(String(userId)))
    );
    if (!user) {
      return res.status(404).json({ error: 'User is not in session' });
    }

    const validAction = ['yes', 'no'];
    if (!validAction.includes(swipeAction)) {
      return res.status(400).json({ error: 'Invalid swipe action' });
    }

    let userSwipe = session.swipes.find((swipe) => swipe.userId.equals(userId));
    if (!userSwipe) {
      userSwipe = { userId, optionSwipes: new Map() };
      session.swipes.push(userSwipe);
    }

    userSwipe.optionSwipes.set(optionId, swipeAction);
    await session.save();

    const optionSwipesObject = Object.fromEntries(userSwipe.optionSwipes);

    return res.status(200).json({
      message: 'Swipe action recorded successfully',
      swipes: optionSwipesObject,
    });
  } catch (error) {
    console.error('Error occured recording swipe action', error);
    res
      .status(500)
      .json({ error: 'Server error occured while recording swipe action' });
  }
});

app.get('/session-result', async (req, res) => {
  const { sessionId } = req.query;

  if (!sessionId) {
    return res.status(400).json({ error: 'Session ID is required' });
  }

  try {
    const session = await Session.findById(sessionId);
    if (!session) {
      return res.status(404).json({ error: "Session doesn't exist" });
    }

    const swipeCount = new Map();
    const userCount = session.users.length;
    const unanimousResults = [];

    session.swipes.forEach((userSwipe) => {
      userSwipe.optionSwipes.forEach((swipeAction, optionId) => {
        if (swipeAction === 'yes') {
          const count = swipeCount.get(optionId) || 0;
          swipeCount.set(optionId, count + 1);
        }
      });
    });

    swipeCount.forEach((count, optionId) => {
      if (count === userCount) {
        unanimousResults.push(optionId);
      }
    });

    if (unanimousResults.length > 0) {
      return res.status(200).json({
        message: 'Unanimous decisions found',
        unanimousResults,
        allResults: [...swipeCount].sort((a, b) => b[1] - a[1]),
      });
    }

    const sortedSwipes = [...swipeCount].sort((a, b) => b[1] - a[1]);

    if (sortedSwipes.length === 0) {
      return res.status(400).json({ error: 'No "yes" swipes recorded' });
    }

    res.status(200).json({
      message: 'No unanimous decisions; sorted yes swipes provided',
      allResults: sortedSwipes,
    });
  } catch (error) {
    console.error('Error retrieving session result:', error);
    res.status(500).json({ error: 'Server error retrieving session result' });
  }
});

app.post('/create-user', async (req, res) => {
  const { userName, email, password } = req.body;

  if (!userName || !email || !password) {
    return res
      .status(400)
      .json({ error: 'Username, email, and password are required.' });
  }

  try {
    const existingUser = await User.findOne({ $or: [{ userName }, { email }] });
    if (existingUser) {
      return res
        .status(400)
        .json({ error: 'Username or email already taken.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      userName,
      email,
      password: hashedPassword,
    });

    await newUser.save();

    res.status(201).json({
      message: 'User created successfully',
      user: {
        id: newUser._id,
        userName: newUser.userName,
        email: newUser.email,
      },
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res
      .status(500)
      .json({ error: 'Server error occurred while creating user.' });
  }
});

module.exports = { app, server };
