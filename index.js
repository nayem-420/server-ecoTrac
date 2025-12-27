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
