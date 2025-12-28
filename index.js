require("dotenv").config();
const express = require("express");
const cors = require("cors");
const app = express();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

// middleware
app.use(
  cors({
    origin: "http://localhost:5174",
    credentials: true,
  })
);
app.use(express.json());

// port connection
const port = process.env.PORT || 3000;

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
    const userActivitiesCollection = db.collection("user_activities");

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

        // Check if challenge exists
        const challenge = await challengesCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!challenge) {
          return res.status(404).send({ message: "Challenge not found" });
        }

        // Check if user already joined
        if (
          challenge.joinedUsers &&
          challenge.joinedUsers.includes(userEmail)
        ) {
          return res
            .status(400)
            .send({ message: "Already joined this challenge" });
        }

        // Create initial user progress
        const initialProgress = {
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

        // Update challenge with new user
        const result = await challengesCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $inc: { participants: 1 },
            $addToSet: { joinedUsers: userEmail },
            $push: { userProgress: initialProgress },
          }
        );

        if (result.modifiedCount === 0) {
          return res.status(400).send({ message: "Failed to join challenge" });
        }

        res.send({
          message: "Joined successfully",
          userProgress: initialProgress,
        });
      } catch (error) {
        console.error("Error joining challenge:", error);
        res.status(500).send({ error: "Failed to join challenge" });
      }
    });

    // Get user's joined challenges
    app.get("/my-activities/:email", async (req, res) => {
      try {
        const email = req.params.email;

        const result = await challengesCollection
          .find({ joinedUsers: email })
          .toArray();

        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: "Failed to fetch activities" });
      }
    });

    app.get("/my-activities/:id", async (req, res) => {
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

        // Calculate additional metrics
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

    app.post("/my-activities/:id/complete-day", async (req, res) => {
      try {
        const id = req.params.id;
        const { email, day, note } = req.body;

        if (!email || !day) {
          return res.status(400).send({ error: "Email and day are required" });
        }

        const challenge = await challengesCollection.findOne({
          _id: new ObjectId(id),
          joinedUsers: email,
        });

        if (!challenge) {
          return res.status(404).send({ error: "Challenge not found" });
        }

        // Find user progress
        const userProgressIndex = challenge.userProgress?.findIndex(
          (p) => p.email === email
        );

        let updatedProgress;

        if (userProgressIndex === -1 || !challenge.userProgress) {
          updatedProgress = {
            email,
            joinedDate: new Date().toISOString(),
            completedDays: [day],
            totalDaysCompleted: 1,
            pointsEarned: 10,
            currentStreak: 1,
            longestStreak: 1,
            lastActivityDate: new Date().toISOString(),
            achievements: ["First Step"],
            notes: note
              ? [{ day, note, timestamp: new Date().toISOString() }]
              : [],
          };

          await challengesCollection.updateOne(
            { _id: new ObjectId(id) },
            { $push: { userProgress: updatedProgress } }
          );
        } else {
          // Update existing progress
          const currentProgress = challenge.userProgress[userProgressIndex];

          // Check if day already completed
          if (currentProgress.completedDays.includes(day)) {
            return res.status(400).send({ error: "Day already completed" });
          }

          // Calculate streak
          const newCompletedDays = [...currentProgress.completedDays, day].sort(
            (a, b) => a - b
          );
          const lastDay = newCompletedDays[newCompletedDays.length - 2] || 0;
          const isConsecutive = day === lastDay + 1;
          const newStreak = isConsecutive
            ? currentProgress.currentStreak + 1
            : 1;
          const newLongestStreak = Math.max(
            newStreak,
            currentProgress.longestStreak
          );

          // Calculate achievements
          const newAchievements = [...currentProgress.achievements];
          if (
            newCompletedDays.length === 1 &&
            !newAchievements.includes("First Step")
          ) {
            newAchievements.push("First Step");
          }
          if (
            newCompletedDays.length === 7 &&
            !newAchievements.includes("Week Warrior")
          ) {
            newAchievements.push("Week Warrior");
          }
          if (newStreak === 7 && !newAchievements.includes("7-Day Streak")) {
            newAchievements.push("7-Day Streak");
          }
          if (
            newCompletedDays.length === challenge.duration &&
            !newAchievements.includes("Challenge Master")
          ) {
            newAchievements.push("Challenge Master");
          }

          updatedProgress = {
            ...currentProgress,
            completedDays: newCompletedDays,
            totalDaysCompleted: newCompletedDays.length,
            pointsEarned: currentProgress.pointsEarned + 10,
            currentStreak: newStreak,
            longestStreak: newLongestStreak,
            lastActivityDate: new Date().toISOString(),
            achievements: newAchievements,
            notes: note
              ? [
                  ...currentProgress.notes,
                  { day, note, timestamp: new Date().toISOString() },
                ]
              : currentProgress.notes,
          };

          await challengesCollection.updateOne(
            { _id: new ObjectId(id), "userProgress.email": email },
            {
              $set: {
                [`userProgress.${userProgressIndex}`]: updatedProgress,
              },
            }
          );
        }

        res.send({
          message: "Day marked as completed!",
          progress: updatedProgress,
        });
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: "Failed to update progress" });
      }
    });

    app.post("/my-activities/:id/add-note", async (req, res) => {
      try {
        const id = req.params.id;
        const { email, day, note } = req.body;

        if (!email || !day || !note) {
          return res
            .status(400)
            .send({ error: "Email, day, and note are required" });
        }

        const result = await challengesCollection.updateOne(
          {
            _id: new ObjectId(id),
            "userProgress.email": email,
          },
          {
            $push: {
              "userProgress.$.notes": {
                day,
                note,
                timestamp: new Date().toISOString(),
              },
            },
          }
        );

        if (result.modifiedCount === 0) {
          return res.status(404).send({ error: "Progress not found" });
        }

        res.send({ message: "Note added successfully!" });
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: "Failed to add note" });
      }
    });

    app.get("/challenges/:id/leaderboard", async (req, res) => {
      try {
        const id = req.params.id;

        const challenge = await challengesCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!challenge) {
          return res.status(404).send({ error: "Challenge not found" });
        }

        // Sort users by points
        const leaderboard = (challenge.userProgress || [])
          .sort((a, b) => b.pointsEarned - a.pointsEarned)
          .slice(0, 10)
          .map((user, index) => ({
            rank: index + 1,
            email: user.email,
            pointsEarned: user.pointsEarned,
            totalDaysCompleted: user.totalDaysCompleted,
            currentStreak: user.currentStreak,
            achievements: user.achievements,
          }));

        res.send(leaderboard);
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: "Failed to fetch leaderboard" });
      }
    });

    app.get("/user-stats/:email", async (req, res) => {
      try {
        const email = req.params.email;

        const challenges = await challengesCollection
          .find({
            joinedUsers: email,
          })
          .toArray();

        // Calculate total stats
        let totalPoints = 0;
        let totalDaysCompleted = 0;
        let totalChallenges = challenges.length;
        let completedChallenges = 0;
        let allAchievements = [];

        challenges.forEach((challenge) => {
          const userProgress = challenge.userProgress?.find(
            (p) => p.email === email
          );
          if (userProgress) {
            totalPoints += userProgress.pointsEarned;
            totalDaysCompleted += userProgress.totalDaysCompleted;
            allAchievements = [
              ...allAchievements,
              ...userProgress.achievements,
            ];

            if (userProgress.totalDaysCompleted >= challenge.duration) {
              completedChallenges++;
            }
          }
        });

        // Unique achievements
        const uniqueAchievements = [...new Set(allAchievements)];

        res.send({
          email,
          totalPoints,
          totalDaysCompleted,
          totalChallenges,
          completedChallenges,
          activeChallenges: totalChallenges - completedChallenges,
          achievements: uniqueAchievements,
        });
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: "Failed to fetch user stats" });
      }
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
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
