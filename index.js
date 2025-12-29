require("dotenv").config();
const express = require("express");
const cors = require("cors");
const app = express();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

// middleware
app.use(
  cors({
    origin: [
      "http://localhost:5174",
      "http://localhost:5173",
      "https://client-eco-track.web.app",
    ],
    credentials: true,
  })
);
app.use(express.json());

// port connection
const port = process.env.PORT || 3000;

const admin = require("firebase-admin");

const decoded = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString(
  "utf8"
);
const serviceAccount = JSON.parse(decoded);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// mongodb connection
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.rn5tut0.mongodb.net/?appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

app.get("/", (req, res) => {
  res.send("Eco-Trac is tracking you....!");
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const db = client.db("ecoTrac");
    const challengesCollection = db.collection("challenges");
    const usersCollection = db.collection("users");
    const userChallengeCollection = db.collection("user_activities");

    // Create or update user
    app.post("/users", async (req, res) => {
      try {
        const user = req.body;

        const existingUser = await usersCollection.findOne({
          email: user.email,
        });

        if (existingUser) {
          return res.send({
            message: "User already exists",
            user: existingUser,
          });
        }

        const newUser = {
          email: user.email,
          name: user.name || user.displayName,
          photoURL: user.photoURL || null,
          role: "user",
          createdAt: new Date().toISOString(),
          totalPoints: 0,
          totalChallengesJoined: 0,
          totalChallengesCompleted: 0,
        };

        const result = await usersCollection.insertOne(newUser);
        res.send(result, {
          message: "User created successfully",
          user: newUser,
        });
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: "Failed to create user" });
      }
    });

    // Get user by email
    app.get("/users/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const user = await usersCollection.findOne({ email });

        if (!user) {
          return res.status(404).send({ error: "User not found" });
        }

        res.send(user);
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: "Failed to fetch user" });
      }
    });

    //   user challenges part
    app.post("/user-challenges", async (req, res) => {
      try {
        const { userId, challengeId } = req.body;

        const existing = await userChallengeCollection.findOne({
          userId,
          challengeId,
        });
        if (existing) {
          return res.send({
            message: "Already joined",
            userChallenge: existing,
          });
        }

        const newUserChallenge = {
          userId,
          challengeId,
          status: "Not Started",
          progress: 0,
          joinedDate: new Date(),
        };
        const result = await userChallengeCollection.insertOne(
          newUserChallenge
        );
        res.send({
          message: "challenge joined Successfully",
          userChallenge: newUserChallenge,
        });
      } catch (error) {
        console.log(error);
        res.status(500).send({ error: "Failed to join challenge" });
      }
    });

    //   create api challenges
    app.post("/challenges", async (req, res) => {
      const cursor = req.body;
      const result = await challengesCollection.insertOne(cursor);
      res.send(result);
    });

    //   see api challenges
    app.get("/challenges", async (req, res) => {
      try {
        const result = await challengesCollection.find().toArray();
        res.send(result);
      } catch (error) {
        console.error(error);
        res
          .status(500)
          .send({ error: "Something went wrong fetching challenges" });
      }
    });

    //   see challenges with id
    app.get("/challenges/:id", async (req, res) => {
      const id = req.params.id;
      const result = await challengesCollection.findOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });

    // creating challenges/join/:id
    app.post("/challenges/join/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const userEmail = req.body.email;

        if (!userEmail) {
          return res.status(400).send({ message: "Email is required" });
        }

        const challenge = await challengesCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!challenge) {
          return res.status(404).send({ message: "Challenge not found" });
        }

        if (challenge.joinedUsers?.includes(userEmail)) {
          return res.send({ message: "Already Joined" });
        }

        const initialProgress = {
          email: userEmail,
          joinedDate: new Date().toISOString(),
          completedDays: [],
          totalDaysCompleted: 0,
          pointsEarned: 0,
          currentStreak: 0,
          longestStreak: 0,
          achievements: [],
        };

        await challengesCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $addToSet: { joinedUsers: userEmail },
            $push: { userProgress: initialProgress },
            $inc: { participants: 1 },
          }
        );

        await usersCollection.updateOne(
          { email: userEmail },
          { $inc: { totalChallengesJoined: 1 } }
        );

        res.send({ message: "Joined successfully", progress: initialProgress });
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: "Failed to join challenge" });
      }
    });

    // Get user's joined challenges
    app.get("/my-activities/user/:email", async (req, res) => {
      try {
        const email = req.params.email;

        const user = await usersCollection.findOne({ email });
        if (!user) return res.status(404).send({ message: "User not found" });

        const userId = user._id.toString();

        const joinedChallenges = await userChallengeCollection
          .find({ userId })
          .toArray();

        if (joinedChallenges.length === 0) return res.send([]);

        const challengeIds = joinedChallenges.map((item) => item.challengeId);

        const challenges = await challengesCollection
          .find({ _id: { $in: challengeIds.map((id) => new ObjectId(id)) } })
          .toArray();

        res.send(challenges);
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: "Failed to fetch activities" });
      }
    });

    app.get("/my-activities/challenge/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const userEmail = req.query.email;

        const challenge = await challengesCollection.findOne({
          _id: new ObjectId(id),
          joinedUsers: userEmail,
        });

        if (!challenge) {
          return res.status(404).send({
            error: "Challenge not found or you haven't joined it",
          });
        }

        const userProgress = challenge.userProgress?.find(
          (progress) => progress.email === userEmail
        ) || {
          email: userEmail,
          joinedDate: new Date().toISOString(),
          completedDays: [],
          totalDaysCompleted: 0,
          pointsEarned: 0,
          currentStreak: 0,
          longestStreak: 0,
          lastActivityDate: null,
          achievements: [],
          notes: [],
        };

        const today = new Date();
        const startDate = new Date(challenge.startDate);
        const endDate = new Date(challenge.endDate);
        const totalDays = challenge.duration;
        const daysPassed = Math.floor(
          (today - startDate) / (1000 * 60 * 60 * 24)
        );
        const daysRemaining = Math.max(0, totalDays - daysPassed);
        const progressPercentage = Math.min(
          (userProgress.totalDaysCompleted / totalDays) * 100,
          100
        );

        // Response with all data
        res.send({
          challenge: {
            id: challenge._id,
            title: challenge.title,
            description: challenge.description,
            category: challenge.category,
            duration: challenge.duration,
            impactMetric: challenge.impactMetric,
            startDate: challenge.startDate,
            endDate: challenge.endDate,
            imageUrl: challenge.imageUrl,
          },
          userProgress: {
            ...userProgress,
            daysPassed,
            daysRemaining,
            progressPercentage: progressPercentage.toFixed(2),
            isActive: today >= startDate && today <= endDate,
            isCompleted: userProgress.totalDaysCompleted >= totalDays,
          },
        });
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: "Failed to fetch activity details" });
      }
    });

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
