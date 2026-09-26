const endpoint = "https://api.panchessco.space/";
const userEndpoint = endpoint + "users/";
const resultsEndpoint = endpoint + "results/";
const modestatsEndpoint = endpoint + "modestats/";
const authEndpoint = endpoint + "auth/";
userToken = "";

/** 
 * @description Obtener un usuario de la base de datos, por la api.
 * @param id el nombre de usuario (username) del usuario. Si no se especifica retorna TODOS los usuarios
 */
async function getUser(id)
{
  if (!isAPIOnline) return;
  return new Promise(async (resolve, rejects) => {
    try {
      let res = await fetch(userEndpoint + id, {
        method: "GET",
        headers: {
          Authorization: "Bearer " + userToken
        }
      });

      if (!res.ok) rejects(null);

      let data = await res.json();
      
      resolve(data);
    } catch (e) {
      rejects(e);
    }
  })
}

/** 
 * @description Obtener TODOS los resultados de la base de datos, por la api.
 */

async function getMe() {
  if (!isAPIOnline) return;
  return new Promise(async (resolve, rejects) => {
    try {
      let res = await fetch(authEndpoint + "me/", {
        method: "GET",
        headers: {
          Authorization: "Bearer " + userToken
        }
      });
      
      if (!res.ok) {
        rejects(null);
        userToken = "";
        me = undefined;
      };

      let data = await res.json();

      resolve(data);
    } catch (e) {
      rejects(e);
    }
  })
}

async function getAllResults()
{
  if (!isAPIOnline || me == undefined) return;
  return new Promise(async (resolve, rejects) => {
    try {
      let res = await fetch(resultsEndpoint + me.user.username, {
        method: "GET",
        headers: {
          Authorization: "Bearer " + userToken
        }
      });

      if (!res.ok) rejects(null);

      let data = await res.json();
      
      resolve(data);
    } catch (e) {
      rejects(e);
    }
  })
}

async function getAllModestats() {
  if (!isAPIOnline || me == undefined) return;
  return new Promise(async (resolve, rejects) => {
    try {
      let res = await fetch(modestatsEndpoint + me.user.username, {
        method: "GET",
        headers: {
          Authorization: "Bearer " + userToken
        }
      });

      if (!res.ok) rejects(null);

      let data = await res.json();

      resolve(data);
    } catch (e) {
      rejects(e);
    }
  })
}

async function getModestats(mode_id) {
  let stats = await getAllModestats();
  stats = stats.stats;
  stats = stats.map(x => x.modestat);

  stats = stats.filter(x => x.modeId == mode_id);

  return stats[0];
}

async function ping() {
  return new Promise(async (res, rej) => {
    try {
      let a = await fetch(endpoint);
      res(a);
    } catch (e) {
      rej(e);
    }
  })
}

async function postResult(Result, username = "n/a") {
  if (!isAPIOnline) return;
  return new Promise (async (resolve, rejects) => {
    if (!Result) rejects ("no result provided")
    try {
      let res = await fetch(resultsEndpoint, {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + userToken,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          username: username,
          result: Result
        })
      })
      resolve(res)
    } catch (e) {
      rejects(e)
      console.log
    }
  })
}

async function putModeStat(modestat, username = "n/a") {
  // TODO: replace mode stats for particular user
  if (!isAPIOnline && me != undefined) return;
  return new Promise(async (resolve, rejects) => {
    if (!modestat) rejects("no stat provided")
    try {
      let res = await fetch(modestatsEndpoint, {
        method: "PUT",
        headers: {
          "Authorization": "Bearer " + userToken,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          username: username,
          modestat: modestat
        })
      })
      resolve(res)
    } catch (e) {
      rejects(e)
      console.log
    }
  })
}

async function login(credentials = { username: "a", password: "a" }) {
  if (!isAPIOnline) return;
  let response = await fetch(authEndpoint + "login/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      username: credentials.username,
      password: credentials.password
    })
  })

  if (!response.ok) throw response.status;

  let json = await response.json();

  userToken = json.token;
  localStorage.setItem("userToken", userToken);

  return await userToken;
}

async function register(credentials = { username: "a", password: "a" }) {
  if (!isAPIOnline) return;
  let response = await fetch(authEndpoint + "register/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      username: credentials.username,
      password: credentials.password
    })
  })

  return response;
}

async function clearOnlineData() {
  if (!isAPIOnline) return;
  return new Promise(async (resolve, rejects) => {
    try {
      let res = await fetch(resultsEndpoint, {
        method: "DELETE",
        headers: {
          "Authorization": "Bearer " + userToken,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
        })
      })
      resolve(res);
    } catch (e) {
      rejects(e)
      console.log
    }
  })
}