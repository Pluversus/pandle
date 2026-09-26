const { MongoClient } = require("mongodb");
const { mongoURI } = require("./secret")

class mongodb {
  client;
  db;
  users;

  constructor() {
    try {
      this.client = new MongoClient(mongoURI);
    } finally {
      this.db = this.client.db("pandle");
      this.users = this.db.collection('users');
      this.results = this.db.collection('results');
      this.stats = this.db.collection('modestats');
    }
  }

  async connect() {
    await this.client.connect();
    await this.db.command({ ping: 1 });
    return 0;
  }

  async disconnect() {
    await this.client.close();
    console.log("Disconnected!");
    return 0;
  }

/**
  * 
  * @description get all users :p
  * 
  */
  
  async getAllUsers() {
    return this.users.find({}).toArray();
  }

 /**
* @description Post a result
* @param result result object to be added, will added just like that
*/

  async insertOneUser(user) {
    let users = await this.users.insertOne(user);
    return users;
  }

  async updateOneModestat({ modestat: stat, username: username }) {
    console.log("entro")
    if (!stat) return;
    console.log("continuo")
    let x = await this.stats.replaceOne(
      {
        username: username,
        "modestat.modeId": stat.modeId
      },
      {
        username,
        modestat: stat
      },
      {
        upsert: true
      }
    );

    console.log(x, "etiqueta")
  }

/**
* @description get one user :p
* @param id the USERNAME of the user, make sure it's unique
*/

  async findOneUser(id) {
    let user = await this.users.findOne({ username: id });
    if (!user) throw "USER_NOT_FOUND";
    return user;
  }

  async cleanUser(user) {
    return {
      _id: user._id,
      username: user.username
    }
  }

/**
* 
* @description verify the username is not used
* @param id the USERNAME of the user
* 
*/

  async isUser(id) {
    let user;
    try {
      await this.users.findOne({ username: id });
    } catch (e) {
      console.log
    }
    
    return user ? true : false;
  }

/**
* @description get ALL match results, from EVERYONE
*/
  async getAllResults() {
    return this.results.find({}).toArray();
  }

/**
* @description get ALL match results, from an username
* @param id the user (username) to get the results from
*/
  async getAllUserResults(id) {
    this.isUser(id);
    let results = await this.results.find({ username: id }).toArray();
    return results;
  }

  async clearData(id) {
    this.isUser(id);
    await this.results.deleteMany({ username: id });
    await this.stats.deleteMany({ username: id });
  }

/**
* @description Post a result
* @param result result object to be added, will added just like that
*/
  async insertOneResult(result) {
    let results = await this.results.insertOne(result);
    return results;
  }

  /**
  * @description Post a stat
  * @param stat stat object to be added, will added just like that
  */
  async insertOneModeStat(stat) {
    let stats = await this.stats.insertOne(stat);
    return stats;
  }

  /**
* @description get ALL mode stats, from an username
* @param id the user (username) to get the results from
*/
  async getAllUserModeStats(id) {
    this.isUser(id);
    let stats = await this.stats.find({ username: id }).toArray();
    return stats;
  }

  async getAllModeStats() {
    let stats = await this.stats.find({}).toArray();
    return stats;
  }
}

module.exports = {
    mongodb
};