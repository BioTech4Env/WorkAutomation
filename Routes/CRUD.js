import dotEnv from 'dotenv'
import express from 'express';
import SQLite3 from 'sqlite3';
import helmet from 'helmet';
import bodyParser from 'body-parser';
import path, { join } from 'path';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

dotEnv.config();
const SERVER_HOSTNAME = process.env.SERVER_HOSTNAME;
const SERVER_PORT = process.env.SERVER_PORT
const localhost = `http://${SERVER_HOSTNAME}:${SERVER_PORT}`

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let modifiedRoute = __dirname.replace('\Routes', '')

//Insert theese resources on a config file
let htmlContentTemplate = readFileSync(modifiedRoute + 'public/ContentBody.html', 'utf-8')
let htmlGetResponseTemplate = readFileSync(modifiedRoute + 'public/GETS/GETS.html', 'utf-8')
let htmlPostResponseTemplate = readFileSync(modifiedRoute + 'public/POST/POST.html', 'utf-8')
let htmlUpdateResponseTemplate = readFileSync(modifiedRoute + 'public/UPDATE/UPDATE.html', 'utf-8')
let htmlDeleteResponseTemplate = readFileSync(modifiedRoute + 'public/DELETE/DELETE.html', 'utf-8')

let returnBackButton = `<button><a href="/">BACK</a></button>`;

let columnsName = [
    "Nome",
    "Cognome",
    "Indirizzo",
    "Posta"
]

const crud = express()
crud.use(helmet())
crud.use(express.json())
crud.use(bodyParser.urlencoded({ extended: true }))
crud.use(express.static('./public/'))

const modelliDB = new SQLite3.Database(join(modifiedRoute + './Database/modelli.db'));

//Gets all elements from the Modelli table
crud.get('/', (req, res) => {
    modelliDB.serialize(_ => {
        modelliDB.all('SELECT ROWID, * FROM Modelli', (err, rows) => {
            if (err) {
                const errorObj = {
                    Code: 1,
                    Body: err
                }
                res.redirect(`/handleError/${JSON.stringify(errorObj)}`)
                return
            }
            let replacedRows = replaceRows(rows)
            res.status(200).send(htmlGetResponseTemplate.replace('{{%Content%}}', returnBackButton + replacedRows))
        })
    })
})

//Get elements with the desired name
crud.get('/Nome=:Nome', (req, res) => {
    let nome = req.params.Nome

    if (nome.includes('_')) {
        res.status(400).send(`Name not specified ${returnBackButton}`)
        return
    }

    modelliDB.serialize(_ => {
        modelliDB.all('SELECT ROWID, * FROM Modelli WHERE Nome = $Nome',
            {
                $Nome: nome
            }
            , (err, rows) => {
                if (err) {
                    const errorObj = {
                        Code: 1,
                        Body: err
                    }
                    res.redirect(`/handleError/${JSON.stringify(errorObj)}`)
                    return
                }

                let replacedRows = replaceRows(rows)
                res.status(200).send(htmlGetResponseTemplate.replace('{{%Content%}}', returnBackButton + replacedRows))
            })
    })
})

//Insert data in the Modelli table
crud.post('/', (req, res) => {
    crud.use(express.static('./public/POST'))
    let jsonObject = {
        $Nome: req.body.nome || null,
        $Cognome: req.body.cognome || null,
        $Indirizzo: req.body.indirizzo || null,
        $Posta: req.body.posta || null,
    };

    modelliDB.serialize(_ => {
        modelliDB.run('INSERT INTO Modelli(Nome, Cognome, Indirizzo, Posta) VALUES ($Nome, $Cognome, $Indirizzo, $Posta)',
            jsonObject, (err) => {
                if (err) {
                    const errorObj = {
                        Code: 0,
                        Body: err
                    }
                    res.redirect(`/handleError/:${JSON.stringify(errorObj)}`)
                    return
                }
                res.status(201).send(htmlPostResponseTemplate + returnBackButton)
            })
    })
})

//Get element to update by id and displays the content on a different html page
crud.get('/Id=:id', (req, res) => {
    crud.use(express.static('./public/UPDATE'))
    let id = req.params.id

    modelliDB.serialize(_ => {
        modelliDB.all('SELECT ROWID, * FROM Modelli WHERE ROWID = $Id', {
            $Id: id
        }, (err, row) => {
            if (err) {
                const errorObj = {
                    Code: 1,
                    Body: err
                }
                res.redirect(`/handleError/:${JSON.stringify(errorObj)}`)
                return
            }
            let replacedRow = rowsRefinment(replaceRows(row))
            let getElementsRow = replacedRow.split('\n')
            let content = [];

            for (let i = 1; i < getElementsRow.length - 1; i++) {
                content.push(`<th>
                    <input value="${getElementsRow[i]
                        .trim()
                        .substring(4, getElementsRow[i].trim().length - 5)}"
                    type="text"
                    required
                    name="${columnsName[i - 1]}">
                    </th>`)
            }
            res.status(200).send(returnBackButton + htmlUpdateResponseTemplate.
                replace('{{%Content%}}', content.join(''))
                .replace(/{{%Id%}}/g, id))
        })
    })
})

/*
Since we are working on localhost environment, we can accept the loss on security
If i wanted to use the post method, i would need to create a new resourse on the db
and then delete the old value, thus preserving some of the security
*/
//The updated data replaces the old data
crud.get('/update/Id=:id', (req, res) => {
    const fullUrl = req.url
    const urlParams = fullUrl.split('?')[1].split('&')
    let id = req.params.id
    let jsonObject = {
        $Id: id,
    };
    for (let i = 0; i < urlParams.length; i++) {
        jsonObject[`$${columnsName[i]}`] = urlParams[i].split('=')[1] || null
    }

    modelliDB.serialize(_ => {
        modelliDB.run(`UPDATE Modelli SET
        Nome = $Nome,
        Cognome = $Cognome,
        Indirizzo = $Indirizzo,
        Posta = $Posta
        WHERE ROWID = $Id`,
            jsonObject, async (err) => {
                if (err) {
                    const errorObj = {
                        Code: 2,
                        Body: err
                    }
                    res.redirect(`/handleError/:${JSON.stringify(errorObj)}`)
                    return
                }
                let options = {
                    method: "PATCH",
                    headers: {
                        'Content-Type': 'application/json'
                    }
                };
                await fetch(`${localhost}/CRUD/update/Id=${id}`, options)
                    .then(res.status(200).send(jsonObject))
            })
    })
})

//Delete specific element by id
crud.get('/delete/Id=:id', (req, res) => {
    let id = req.params.id
    modelliDB.serialize(_ => {
        modelliDB.run('DELETE FROM Modelli WHERE ROWID = $Id', {
            $Id: id
        }, (err) => {
            if (err) {
                const errorObj = {
                    Code: 3,
                    Body: err
                }
                res.redirect(`/handleError/:${JSON.stringify(errorObj)}`)
                return;
            }
            let options = {
                method: "DELETE",
                headers: {
                    'Content-Type': 'application/json'
                }
            }
            fetch(`${localhost}/CRUD/delete/Id=${id}`, options)
                .then(res.status(200).send(htmlDeleteResponseTemplate + returnBackButton))
        })
    })
})

//Displayes content gathered from the db as table format
function replaceRows(rows) {
    let jsonTemplate = JSON.parse(JSON.stringify(rows))
    let replacedRows = jsonTemplate.map(json => {
        let outputRow = htmlContentTemplate
            .replace('{{%Nome%}}', json.Nome)
            .replace('{{%Cognome%}}', json.Cognome)
            .replace('{{%Indirizzo%}}', json.Indirizzo)
            .replace('{{%Posta%}}', json.Posta)
            .replace(/{{%Id%}}/g, json.rowid)

        return outputRow
    })
    return replacedRows.join('');
}

function rowsRefinment(replacedRows){
    let subString = replacedRows.split('</th>')
    subString.splice(subString.length - 2, 1)
    return subString.join('</th>')
}

export default crud;