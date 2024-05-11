const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const app = express();
const port = process.env.PORT || 5000;

// middlewares
app.use(cookieParser());
app.use(
  cors({
    origin: ["http://localhost:5173"],
    credentials: true,
  })
);
app.use(express.json());

const verifyToken = (req, res, next) => {
  const token = req.cookies?.token;
  if (!token) {
    return res.status(401).send({ message: "unauthorized access" });
  }
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "unauthorized access" });
    }
    req.user = decoded;
    next();
  });
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster1.iq3jpr7.mongodb.net/?retryWrites=true&w=majority&appName=Cluster1`;
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
async function run() {
  try {
    const database = client.db("Volunize-Hub");
    const volunteerPostCollection = database.collection("volunteer-post");
    const craftCategoriesCollection = database.collection("craft-categories");

    // auth api
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "30d",
      });
      res
        .cookie("token", token, {
          httpOnly: true,
          secure: false,
        })
        .send({ success: true });
    });
    app.post("/logout", (req, res) => {
      res.clearCookie("token", { maxAge: 0 }).send({ success: true });
    });

    // volunteer need api
    app.get("/posts", async (req, res) => {
      const cursor = volunteerPostCollection
        .find()
        .sort({ deadline: 1 })
        .limit(6);
      const result = await cursor.toArray();
      res.send(result);
    });
    // users post
    app.get("/post", verifyToken, async (req, res) => {
      if (req.user.email !== req.query.email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const email = req.query.email;
      const query = { organizer_Email: email };
      const cursor = volunteerPostCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });
    // get the single data
    app.get("/post/:id", verifyToken, async (req, res) => {
      if (req.user.email !== req.query.email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await volunteerPostCollection.findOne(query);
      res.send(result);
    });
    // add post
    app.post("/post", verifyToken, async (req, res) => {
      if (req.user.email !== req.query.email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const post = req.body;
      const result = await volunteerPostCollection.insertOne(post);
      res.send(result);
    });
    // update post
    app.put("/post/:id", verifyToken, async (req, res) => {
      if (req.user.email !== req.query.email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const id = req.params.id;
      const post = req.body;

      const filter = { _id: new ObjectId(id) };
      const updatedPost = {
        $set: {
          title: post.title,
          category: post.category,
          location: post.location,
          numberOfVolunteer: post.numberOfVolunteer,
          photo_url: post.photo_url,
          description: post.description,
          deadline: post.deadline,
          organizer_Email: post.organizer_Email,
          organizer_Name: post.organizer_Name,
        },
      };
      const result = await volunteerPostCollection.updateOne(
        filter,
        updatedPost
      );
      res.send(result);
    });
  } finally {
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("hello world");
});

app.listen(port, () => {
  console.log(`server running on port : ${port}`);
});
