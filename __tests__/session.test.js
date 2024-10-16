const request = require('supertest');
const mongoose = require('mongoose');
const User = require('../models/User');
const Session = require('../models/Session');
const { app, server } = require('../server');
const { MongoMemoryServer } = require('mongodb-memory-server');

jest.mock('../db', () => jest.fn(() => Promise.resolve()));

describe('Session Endpoints', () => {
  let userId;
  let mongoServer;
  let emptySessionId;
  let unanimousSessionId;
  let completedSessionId;
  let cancelledSessionId;
  let nonUnanimousSessionId;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    const emptySession = new Session({
      title: 'Test',
    });
    await emptySession.save();
    emptySessionId = emptySession._id.toString();

    const completedSession = new Session({
      title: 'Test',
      status: 'Completed',
    });
    await completedSession.save();
    completedSessionId = completedSession._id.toString();

    const cancelledSession = new Session({
      title: 'Test',
      status: 'Cancelled',
    });
    await cancelledSession.save();
    cancelledSessionId = cancelledSession._id.toString();

    const user = new User({
      userName: 'testuser',
      email: 'test@example.com',
    });
    await user.save();
    userId = user._id.toString();

    const optionSwipes = new Map();
    optionSwipes.set('2', 'yes');

    const unanimousSession = new Session({
      title: 'Test',
      options: [
        { optionId: '1', description: 'cinema', yesVotes: 0, noVotes: 0 },
        { optionId: '2', description: 'restaurant', yesVotes: 1, noVotes: 0 },
      ],
      swipes: [{ userId, optionSwipes }],
      users: [userId],
    });
    await unanimousSession.save();
    unanimousSessionId = unanimousSession._id.toString();

    const nonUnanimousSession = new Session({
      title: 'Test',
      options: [
        { optionId: '1', description: 'cinema', yesVotes: 0, noVotes: 0 },
        { optionId: '2', description: 'restaurant', yesVotes: 1, noVotes: 0 },
      ],
      swipes: [{ userId, optionSwipes }],
      users: [userId, new mongoose.Types.ObjectId()],
    });
    await nonUnanimousSession.save();
    nonUnanimousSessionId = nonUnanimousSession._id.toString();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
    server.close();
  });

  describe('/create-session Endpoint', () => {
    test('should create a new session and update the users createdSessions propterty', async () => {
      const res = await request(app)
        .post('/create-session')
        .set('Content-Type', 'application/json')
        .send({ title: 'Test', userId: userId });

      expect(res.statusCode).toBe(201);
      expect(res.body).toHaveProperty(
        'message',
        'Session was created successfully'
      );
      expect(res.body.session).toHaveProperty('title', 'Test');
      expect(res.body.session).toHaveProperty('createdBy', userId);
      expect(res.body).toHaveProperty('inviteLink');

      const sessionInDb = await Session.findById(res.body.session._id);
      expect(sessionInDb).not.toBeNull();

      const updatedUser = await User.findById(userId);
      expect(updatedUser.createdSessions).toContainEqual(sessionInDb._id);
    });

    test("should return 400 if title isn't provided", async () => {
      const res = await request(app).post('/create-session').send({ userId });
      expect(res.statusCode).toBe(400);
      expect(res.body).toHaveProperty('error', 'Invalid title or user ID');
    });

    test("should return 400 if userId isn't provided", async () => {
      const res = await request(app)
        .post('/create-session')
        .send({ title: 'Test' });
      expect(res.statusCode).toBe(400);
      expect(res.body).toHaveProperty('error', 'Invalid title or user ID');
    });

    test("Should return 404 if user doesn't exist", async () => {
      const res = await request(app)
        .post('/create-session')
        .send({ title: 'test', userId: new mongoose.Types.ObjectId() });
      expect(res.statusCode).toBe(404);
      expect(res.body).toHaveProperty('error', "User doesn't exist");
    });

    test('Should return 500 if there is an unexpected error during session creation', async () => {
      jest.spyOn(Session, 'create').mockImplementation(() => {
        throw new Error('Unexpted Error');
      });

      const res = await request(app)
        .post('/create-session')
        .send({ title: 'test', userId });
      expect(res.status).toBe(500);
      expect(res.body).toHaveProperty(
        'error',
        'Server error occured while creating session'
      );
    });
  });

  describe('/join-session Endpoint', () => {
    test('should add user to session and update users joinedSessions property', async () => {
      const res = await request(app)
        .post('/join-session')
        .send({ sessionId: emptySessionId, userId });

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty(
        'message',
        'User successfully joined session'
      );
      expect(res.body.session.users).toContain(userId);
      const sessionInDb = await Session.findById(emptySessionId);
      const updatedUser = await User.findById(userId);
      expect(updatedUser.joinedSessions).toContainEqual(sessionInDb._id);
    });

    test('should return 400 if sessionId is missing', async () => {
      const res = await request(app).post('/join-session').send({ userId });
      expect(res.statusCode).toBe(400);
      expect(res.body).toHaveProperty(
        'error',
        'sessionID and userID are required'
      );
    });

    test('should return 400 if userId is missing', async () => {
      const res = await request(app)
        .post('/join-session')
        .send({ sessionId: unanimousSessionId });
      expect(res.statusCode).toBe(400);
      expect(res.body).toHaveProperty(
        'error',
        'sessionID and userID are required'
      );
    });

    test('should return 400 if session status is complete', async () => {
      const res = await request(app)
        .post('/join-session')
        .send({ sessionId: completedSessionId, userId });
      expect(res.statusCode).toBe(400);
      expect(res.body).toHaveProperty(
        'error',
        'Cannot join a completed session'
      );
    });

    test('should return 400 if session status is cancelled', async () => {
      const res = await request(app)
        .post('/join-session')
        .send({ sessionId: cancelledSessionId, userId });
      expect(res.statusCode).toBe(400);
      expect(res.body).toHaveProperty(
        'error',
        'Cannot join a cancelled session'
      );
    });

    test("should return 404 if session doesn't exist", async () => {
      const res = await request(app)
        .post('/join-session')
        .send({ sessionId: new mongoose.Types.ObjectId(), userId });
      expect(res.statusCode).toBe(404);
      expect(res.body).toHaveProperty('error', "Session doesn't exist");
    });

    test("should return 404 if user doesn't exist", async () => {
      const res = await request(app).post('/join-session').send({
        userId: new mongoose.Types.ObjectId(),
        sessionId: emptySessionId,
      });
      expect(res.statusCode).toBe(404);
      expect(res.body).toHaveProperty('error', "User doesn't exist");
    });

    test('should return 400 if user is already in session', async () => {
      const res = await request(app)
        .post('/join-session')
        .send({ userId, sessionId: unanimousSessionId });
      expect(res.statusCode).toBe(400);
      expect(res.body).toHaveProperty(
        'error',
        'User is already in the session'
      );
    });
    test('should return 500 if an error occurs during session lookup', async () => {
      jest.spyOn(Session, 'findById').mockImplementation(() => {
        throw new Error('Database failure');
      });

      const res = await request(app)
        .post('/join-session')
        .send({ sessionId: 'validSessionId', userId: 'validUserId' });

      expect(res.statusCode).toBe(500);
      expect(res.body).toHaveProperty('error', 'Server error');

      Session.findById.mockRestore();
    });
  });

  describe('/swipe-option Endpoint', () => {
    test('should add valid swipe option to the session', async () => {
      const res = await request(app).post('/swipe-option').send({
        sessionId: unanimousSessionId,
        userId,
        optionId: '1',
        swipeAction: 'yes',
      });
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty(
        'message',
        'Swipe action recorded successfully'
      );
      expect(res.body.swipes).toHaveProperty('1', 'yes');
    });

    test('should return 400 if required fields are missing', async () => {
      const missingFieldCases = [
        {
          userId: 'validUserId',
          optionId: 'validOptionId',
          swipeAction: 'yes',
        },
        {
          sessionId: 'validSessionId',
          optionId: 'validOptionId',
          swipeAction: 'yes',
        },
        {
          sessionId: 'validSessionId',
          userId: 'validUserId',
          swipeAction: 'yes',
        },
        {
          sessionId: 'validSessionId',
          userId: 'validUserId',
          optionId: 'validOptionId',
        },
        {},
      ];

      for (const testCase of missingFieldCases) {
        const res = await request(app).post('/swipe-option').send(testCase);

        expect(res.statusCode).toBe(400);
        expect(res.body).toHaveProperty(
          'error',
          'session ID, user ID, option ID and swipe action are required'
        );
      }
    });

    test("should return 404 if session doesn't exist", async () => {
      const res = await request(app).post('/swipe-option').send({
        sessionId: new mongoose.Types.ObjectId(),
        userId,
        optionId: '1',
        swipeAction: 'yes',
      });
      expect(res.statusCode).toBe(404);
      expect(res.body).toHaveProperty('error', "Session doesn't exist");
    });

    test("should return 404 if user doesn't exist", async () => {
      const res = await request(app).post('/swipe-option').send({
        sessionId: unanimousSessionId,
        userId: new mongoose.Types.ObjectId(),
        optionId: '1',
        swipeAction: 'yes',
      });
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error', 'User is not in session');
    });

    test('should return 400 if swipe action is invalid', async () => {
      const res = await request(app).post('/swipe-option').send({
        sessionId: unanimousSessionId,
        userId: userId,
        optionId: '1',
        swipeAction: 'yessir',
      });
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'Invalid swipe action');
    });

    test('should return 500 if an error occurs during session lookup', async () => {
      jest.spyOn(Session, 'findById').mockImplementation(() => {
        throw new Error('Database failure');
      });

      const res = await request(app).post('/swipe-option').send({
        sessionId: unanimousSessionId,
        userId: userId,
        optionId: '1',
        swipeAction: 'yes',
      });

      expect(res.statusCode).toBe(500);
      expect(res.body).toHaveProperty(
        'error',
        'Server error occured while recording swipe action'
      );

      Session.findById.mockRestore();
    });
  });

  test('should return unanimous decision', async () => {
    const res = await request(app)
      .get(`/session-result`)
      .query({ sessionId: unanimousSessionId });

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('message', 'Unanimous decisions found');
    expect(res.body).toHaveProperty('unanimousResults');
    expect(res.body.unanimousResults).toBeInstanceOf(Array);
    expect(res.body.unanimousResults.length).toBeGreaterThan(0);
  });

  test('should return sorted yes answers if no unanimous decision', async () => {
    const res = await request(app)
      .get('/session-result')
      .query({ sessionId: nonUnanimousSessionId });

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty(
      'message',
      'No unanimous decisions; sorted yes swipes provided'
    );
    expect(res.body).toHaveProperty('allResults');
    expect(res.body.allResults).toBeInstanceOf(Array);
    expect(res.body.allResults.length).toBeGreaterThan(0);
  });

  test("should return 404 if session doesn't exist", async () => {
    const res = await request(app)
      .get('/session-result')
      .query({ sessionId: new mongoose.Types.ObjectId().toString() });

    expect(res.statusCode).toBe(404);
    expect(res.body).toHaveProperty('error', "Session doesn't exist");
  });

  test('should return 400 if sessionId is invalid', async () => {
    const res = await request(app).get('/session-result').query({});

    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty('error', 'Session ID is required');
  });

  test('should return 400 if no "yes" swipes were recorded', async () => {
    const res = await request(app)
      .get('/session-result')
      .query({ sessionId: emptySessionId });

    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty('error', 'No "yes" swipes recorded');
  });

  test('should return 500 if an error occurs during session lookup', async () => {
    jest.spyOn(Session, 'findById').mockImplementation(() => {
      throw new Error('Database failure');
    });

    const res = await request(app).get('/session-result').query({
      sessionId: unanimousSessionId,
    });

    expect(res.statusCode).toBe(500);
    expect(res.body).toHaveProperty(
      'error',
      'Server error retrieving session result'
    );

    Session.findById.mockRestore();
  });
});
