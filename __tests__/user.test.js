const request = require('supertest');
const mongoose = require('mongoose');
const { app, server } = require('../server');
const { MongoMemoryServer } = require('mongodb-memory-server');

jest.mock('../db', () => jest.fn(() => Promise.resolve()));

describe('User Endpoints', () => {
  let mongoServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
    server.close();
  });

  test('Should create a new user', async () => {
    const res = await request(app).post('/create-user').send({
      userName: 'testUser',
      email: 'test@example.com',
      password: 'testPasword',
    });

    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('message', 'User created successfully');
  });
});
