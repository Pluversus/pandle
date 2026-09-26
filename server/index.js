// Empezar el tunel de clouflare, seguro hay una mejor forma de hacerlo
// pero esto es un par de lineas no mas
/**
 * @description Creación del puente (tunnel) de cloudflare
 */
const { spawn } = require("child_process");
const {
    mongodb
} = require("./dbservice");

DB = new mongodb();

try {
  DB.connect();
  console.log("nos conectamos :D")
}
catch (e) {
  return;
}

//en caso de que quiera correr solo local
if (true)
{
  const process = spawn("server.bat", [], {
      shell: true
  });

  process.stdout.on("data", data => {
      //console.log(data.toString());
  });

  process.stderr.on("data", data => {
      console.error(data.toString());
});}

// ahora si hacemos la api
// setup

/**
 * @desciption creación de la api, escuchamos el puerto 3000 (harcodeado)
 */

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { JWTSecret } = require("./secret.json")

const app = express();
const users = express.Router();
const results = express.Router();
const modestats = express.Router();
const auth = express.Router();

app.use(cors({
  origin: "https://pluversus.github.io"
}));
app.use(express.json());
app.use("/users", users);
app.use("/results", results);
app.use("/modestats", modestats);
app.use("/auth", auth);
users.use(authenticate);

// endpoints, un solo archivo hasta la muerte

app.get("/", (req, res) => {
  res.status(200).json({
    message: "pong!"
  });
})

// user endpoint

users.get("/", async (req,res) => {
  _users = await DB.getAllUsers();
  res.status(200).json({
    message: "en teoría, todos los usuarios",
    users: _users
  });
})

users.get("/:id", async (req,res) => {
  let _user;
  try {
    _user = await DB.findOneUser(req.params.id);
  } catch (e) {
    res.status(404).json({
      message: "User not found x.x",
      user: null
    })
    return;
  }
  res.status(200).json({
    message: "en teoría, el usuario",
    user: _user
  });
})

//TODO

// stat endpoints

results.get("/", async (req, res) => {
  let _results;
  try {
    _results = await DB.getAllResults();
  } catch (e) {
    res.status(500).json({
      message: "error en la db, no se",
      results: _results
    })
  }
  res.status(200).json({
    message: "All players' match results",
    results: _results
  })
})

results.get("/:id", async (req, res) => {
  let _results;
  let _target;

  let _username = req.params.id;

  if (!DB.isUser(_username)) {
    res.status(404).json({
      message: "user not found x.x",
      user: null,
      matchResults: []
    })
    return;
  }

  try {
    _results = await DB.getAllUserResults(_username);
    _target = await DB.findOneUser(_username);
  } catch (e) {
    res.status(500).json({
      message: "error en la db, no se",
      user: null,
      results: []
    })
    return;
  }

  res.status(200).json({
    message: "All of their match results",
    user: _target,
    results: _results
  })
  return;
})

results.post("/", async (req, res) => {
  if (!req.body) {
    res.status(400)
  }

  DB.insertOneResult(req.body);

  res.status(201).json({
    message: "Result added",
    result: req.body
  })
})

results.delete("/", authenticate , async (req, res) => {
  DB.clearData(req.user.username); // TODO: this function doesn't exist

  res.status(201).json({
    message: "Data Cleared",
    result: req.body
  })
})

modestats.post("/", async (req, res) => {
  if (!req.body) {
    res.status(400)
  }

  DB.insertOneModeStat(req.body);

  res.status(201).json({
    message: "Stat added",
    modestat: req.body
  })
})

modestats.put("/", async (req, res) => {
  if (!req.body) {
    res.status(400)
  }

  if (req.body.username == "n/a") {
    res.status(401).json({
      message: "invalid username",
      modestat: null
    })
  }

  DB.updateOneModestat(req.body);

  res.status(201).json({
    message: "Stat added",
    modestat: req.body
  })
})

modestats.get("/", async (req, res) => {
  let _stats;
  try {
    _stats = await DB.getAllModeStats(); // TODO: THIS FUNCTION DOESN'T EXIST
  } catch (e) {
    res.status(500).json({
      message: "error en la db, no se",
      stats: null
    })
  }
  res.status(200).json({
    message: "All players' match results",
    stats: _stats
  })
})

modestats.get("/:id", async (req, res) => {
  let _stats;
  let _target;

  let _username = req.params.id;

  if (!DB.isUser(_username)) {
    res.status(404).json({
      message: "user not found x.x",
      user: null,
      stats: []
    })
    return;
  }

  try {
    _stats = await DB.getAllUserModeStats(_username);
    _target = await DB.findOneUser(_username);
  } catch (e) {
    res.status(500).json({
      message: "error en la db, no se",
      user: null,
      stats: []
    })
    return;
  }

  res.status(200).json({
    message: "All of their match results",
    user: _target,
    stats: _stats
  })
  return;
})

// logins (me quiero matar)

auth.post("/login", async (req, res) => {
  let { username, password } = req.body;
  let user;

  try {
    user = await DB.findOneUser(username);
  } catch (e) {
    return res.status(404).json({
      message: "User not found.",
      token: ""
    })
  }

  if (!user || !(await bcrypt.compare(password, user.hash))) {
    res.status(401).json({
      message: "No es la contraseña",
      token: ""
    });
    return;
  }

  let token = jwt.sign({
    username: user.username
  }, JWTSecret
  ,{
    expiresIn: "2h"
  })

  res.status(200).json({
    message: "Login successful",
    token: token
  });
  return;
})

auth.get("/me", authenticate, async (req, res) => {

  let username = req.user.username;

  res.status(200).json({
    user: await DB.cleanUser(await DB.findOneUser(username))
  })
})

auth.post("/register", async (req, res) => {
  let { username, password } = req.body;
  let user = await DB.findOneUser(username).catch(e => { console.log });

  if (user) {
    res.status(418).json({
      message: "User Already Exists"
    });
    return;
  }

  let hash = await bcrypt.hash(password, 10);

  await DB.insertOneUser({
    username,
    hash
  })

  res.status(200).json({
    message: "User created!"
  });

  return;
})

// ahora te escucha

app.listen(3000, () => {
  console.log("La api se está corriendo en tu puerto 3000");
})

/**
* @description Autenticación para la API
* @param {req} req request
* @param {res} res response
* @param {next} next no sé
*/

function authenticate(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({
      message: "Missing bearer token"
    });
  }

  try {
    req.user = jwt.verify(token, JWTSecret);
    next();
  } catch {
    return res.status(401).json({
      message: "Invalid token"
    });
  }
}