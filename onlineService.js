const endpoint = "http://localhost:3000/"
const userEndpoint = endpoint + "users/"
const resultsEndpoint = endpoint + "results/"
const token = "supersecreta-123"

/** 
 * @description Obtener un usuario de la base de datos, por la api.
 * @param id el nombre de usuario (username) del usuario. Si no se especifica retorna TODOS los usuarios
 */
async function getUser(id)
{
  return new Promise(async (resolve, rejects) => {
    try {
      let res = await fetch(userEndpoint + id, {
        method: "GET",
        headers: {
          Authorization: "Bearer supersecreta-123"
        }
      });

      console.log("statusCode:", res.status);

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

async function getAllResults()
{
  return new Promise(async (resolve, rejects) => {
    try {
      let res = await fetch(resultsEndpoint, {
        method: "GET",
        headers: {
          Authorization: "Bearer " + token
        }
      });

      console.log("statusCode:", res.status);

      if (!res.ok) rejects(null);

      let data = await res.json();
      
      resolve(data);
    } catch (e) {
      rejects(e);
    }
  })
}

async function ping() {
  return new Promise(async (res, rej) => {
    console.log(await fetch(endpoint))
  })
}

async function postResult(Result, username = "juan") {
  return new Promise (async (resolve, rejects) => {
    if (!Result) rejects ("no result provided")
    try {
      let res = await fetch(resultsEndpoint, {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + token,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          username: username,
          result: Result
        })
      })
    } catch (e) {
      console.log
    }
  })
}