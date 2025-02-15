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
    origin: [
      "https://volunizehub.web.app",
      "https://volunizehub.firebaseapp.com",
    ],
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
    const volunteerRequestCollection = database.collection("volunteer-request");

    // auth api
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "30d",
      });
      res
        .cookie("token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
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

    // all volunteer need post api
    app.get("/allPosts", async (req, res) => {
      const size = parseInt(req.query.size);
      const page = parseInt(req.query.page) - 1;
      const search = req.query.search;
      const sortField = req.query.sortField || "deadline"; // Default sorting field
      const sortOrder = req.query.sortOrder === "desc" ? -1 : 1; // Default to ascending

      // Add your filter parameters
      const category = req.query.category;
      const minVolunteers = parseInt(req.query.minVolunteers);
      const maxVolunteers = parseInt(req.query.maxVolunteers);

      let query = {
        title: { $regex: search, $options: "i" },
      };

      // Add filters to the query
      if (category) {
        query.category = { $regex: category, $options: "i" };
      }
      if (minVolunteers) {
        query.numberOfVolunteer = { $gte: minVolunteers };
      }
      if (maxVolunteers) {
        query.numberOfVolunteer = query.numberOfVolunteer || {};
        query.numberOfVolunteer.$lte = maxVolunteers;
      }

      const cursor = volunteerPostCollection
        .find(query)
        .skip(page * size)
        .limit(size)
        .sort({ [sortField]: sortOrder });

      const result = await cursor.toArray();
      res.send(result);
    });

    // Get all post data count from db
    app.get("/post-count", async (req, res) => {
      const search = req.query.search;
      let query = {
        title: { $regex: search, $options: "i" },
      };
      const count = await volunteerPostCollection.countDocuments(query);
      res.send({ count });
    });
    // getting users post
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
    // get the volunteer request
    app.get("/allRequest", verifyToken, async (req, res) => {
      if (req.user.email !== req.query.email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const email = req.query.email;
      const query = {
        volunteer_email: email,
      };
      const cursor = volunteerRequestCollection.find(query);
      const result = await cursor.toArray();
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
    // add volunteer request
    app.post("/request", verifyToken, async (req, res) => {
      if (req.user.email !== req.query.email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const requestData = req.body;
      const query = {
        volunteer_email: requestData.volunteer_email,
        postId: requestData.postId,
      };

      const alreadyApplied = await volunteerRequestCollection.findOne(query);
      if (alreadyApplied) {
        return res.send("You have already placed a request on this post");
      }

      const result = await volunteerRequestCollection.insertOne(requestData);

      const updateDoc = {
        $inc: { numberOfVolunteer: -1 },
      };
      const requestQuery = { _id: new ObjectId(requestData.postId) };
      const updatePost = await volunteerPostCollection.updateOne(
        requestQuery,
        updateDoc
      );
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
    // delete post
    app.delete("/post/:id", verifyToken, async (req, res) => {
      if (req.user.email !== req.query.email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const id = req.params;
      const query = { _id: new ObjectId(id) };
      const result = await volunteerPostCollection.deleteOne(query);
      res.send(result);
    });

    // delete request
    app.delete("/request/:id", verifyToken, async (req, res) => {
      if (req.user.email !== req.query.email) {
        return res.status(403).send({ message: "forbidden access" });
      }

      const updateDoc = {
        $inc: { numberOfVolunteer: 1 },
      };
      const requestQuery = { _id: new ObjectId(req.query.id) };
      const updatePost = await volunteerPostCollection.updateOne(
        requestQuery,
        updateDoc
      );
      const id = req.params;
      const query = { _id: new ObjectId(id) };
      const result = await volunteerRequestCollection.deleteOne(query);
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
