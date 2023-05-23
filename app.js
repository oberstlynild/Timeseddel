const express = require("express")
const app = express()
const mongoose = require("mongoose")
const bodyParser = require("body-parser")
const moment = require("moment")
var session = require("express-session")
var methodOverride = require('method-override')
var bcrypt = require("bcrypt")
var cron = require('node-cron');
var nodemailer = require("nodemailer")
require("dotenv/config")

moment.locale("da")
//Serving static files
app.use(express.static("public"))
app.use(methodOverride("_method"))

// Import Models
const Users = require("./models/User")
const Timeseddel = require("./models/Timeseddel")

//Set templating engine as ejs
app.set("view engine", "ejs")

app.use(session({ secret: process.env.SESSION_SECRET, saveUninitialized: false, resave: false }))
app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json())


app.use((req, res, next) => {
    if(!req.session.loggedIn && req.path !== "/login" && req.path !== "/")
    {
        res.redirect("/login")
        return;
    }
    res.locals.loggedIn = req.session.loggedIn;
    res.locals.role = req.session.role;
    res.locals.username = req.session.username;
    next();
});

//Routing
app.get("/", (req, res) => {
    const query = {username: 'Admin'} 
    const update = {$setOnInsert: {username: 'Admin', password: '$2a$10$.L6StaMjStz8EGSyE134wu3F/aDyWitAm3bCxWGgIuNAX/mDd4Ni6', role: 'admin'}} 
    const options = {upsert: true} 
    Users.updateOne(query, update, options)
    .catch(err => console.log(err))
    res.render("home", {  })
})

app.get("/login", (req, res) => {
    res.render("login", { username: null, error: null })
})

app.get("/new", (req, res) => {
    res.render("new", {  })
})

app.get("/new-user", (req, res) => {
    res.render("new-user", { error: null })
})

app.get("/edit/:id", (req, res) => {
    Timeseddel.findById(req.params.id).then(data => {
        res.render("edit", { data: data })
    })
})

app.get("/logout", (req, res) => {
    req.session.destroy()
    res.redirect("/")
})

app.get("/overview", (req, res) => {
    let userId = req.session.userId
    let selectedUserId = req.session.selectedUserId
    if(req.session.selectedUserId){
        userId = selectedUserId;
        delete req.session.selectedUserId
    }

    Timeseddel.find({userId: userId, achieved: false}).sort({ "start": 1 }).then(data => {
        Users.find().then(users => {
            let selectedUser = users.find(user => user.id === userId)
            res.render("overview", {data: data, moment:moment, users: users, selectedUser: selectedUser})
        })
    })
})

app.post("/overview", (req, res) => {
    let userId = req.body.selectedUser
    
    Timeseddel.find({userId: userId, achieved: false}).sort({ "start": 1 }).then(data => {
        Users.find().then(users => {
            let selectedUser = users.find(user => user.id === userId)
            res.render("overview", {data: data, moment:moment, users: users, selectedUser: selectedUser})
        })
    })
})

app.post("/new-user", async (req, res) => {
    let username = req.body.username
    let password = req.body.password
    let role = req.body.role

    if(username === "" || password === "")
        return res.render("New-user", { error: "Udfyld brugernavn og password" })

    await Users.findOne({ username: username }).then(async (userFound) => {
        if (userFound) 
            return res.render("New-user", { error: "Brugernavn taget" })
            
        let saltRounds = 10
        bcrypt.genSalt(saltRounds, async (err, salt) => {
            bcrypt.hash(password, salt, async (err, hash) => {
                let newUser = Users({ username: username, password: hash, role: role})
                newUser.save()
                res.redirect("overview")
            })
        })
    })
})

app.post("/new", (req, res) => {
    let start = req.body.start
    let end = req.body.end
    let id = req.session.userId
    let timeseddel = new Timeseddel({start: start, end: end, userId: id})
    timeseddel.save()
    Users.updateOne(
        { "_id": id },
        { $push: { "timesedler": timeseddel } }
    ).catch(err => console.log(err))
    
    res.redirect("/overview")
})

app.post("/login", async (req, res) => {
    let username = req.body.username
    let password = req.body.password
    let loginSuccess = false
    let sesh = req.session
    sesh.loggedIn = false;

    if(username != "" && password != ""){
        await Users.findOne({username: username}).then(async(data) => {
            if(data){
                await bcrypt.compare(password, data.password).then(isMatch => {
                    if(isMatch){
                        sesh.loggedIn = true
                        sesh.role = data.role
                        sesh.userId = data.id
                        sesh.username = data.username
                        loginSuccess = true
                    }
                })
            }
        })
    }
    if(loginSuccess){
        res.redirect("/")
    }else{
        res.render("Login", {error: "Forkert login", username: username})
    }
})

app.put("/edit/:id", (req, res) => {
    Timeseddel.updateOne(
        { "_id": req.params.id },
        {$set: { "start": req.body.start, "end": req.body.end }}
    ).then(() => {
        res.redirect("/overview")
    }).catch(err => console.log(err))
})

app.delete("/delete/:id/:userId", (req, res) => {
    const id = req.params.id
    const userId = req.params.userId

    Timeseddel.findByIdAndDelete(id)
    .then(() => {
        Users.updateOne(
            { "_id": userId },
            { $pull: { "timesedler": id }}
        )
        .then(() => {
            req.session.selectedUserId = userId
            res.redirect("/overview")})
        .catch(err => console.log(err))
    })
    .catch(err => console.log(err))
})

// cron.schedule('0 2 20 * *', async() => { // klokken 2 om natten den 20. hver måned
cron.schedule('0 4 21 * *', async() => {
    Users.find()
    .populate({
        path: "timesedler",
        match: {achieved: false}
    })
    .then((data)=> {
        let message = "";
        
        data.forEach(user => {
            let totalDuration = moment.duration();
            let itemHours;
            let itemMinutes;
            let totalHours;
            let totalMinutes;
            
            let workDays = [];
            if(!user.timesedler.length){
                console.log('yes')
                return;
            }
            
            user.timesedler.forEach(timeseddel => {
                let start = moment(timeseddel.start)
                let end = moment(timeseddel.end)
                let duration = moment.duration(end.diff(start))
                itemHours = duration.hours();
                itemMinutes = duration.minutes();
                if (duration.days() >= 1) {
                    itemHours += 24 * duration.days();
                }
                totalDuration.add(duration)
                totalHours = (24 * totalDuration.days()) + totalDuration.hours();
                totalMinutes = totalDuration.minutes();
                workDays.push(start.format("Do MMM HH[:]mm") + " - " + end.format("HH[:]mm") + ` (${itemHours.toString().padStart(2, "0")}:${itemMinutes.toString().padStart(2, "0")})`)
                timeseddel.achieved = true
                timeseddel.save()
            })
            console.log(totalHours);
            message += `<strong>Medarbejder:</strong><br>`
            message += `${user.username}<br>`
            message += `<strong>Timer i alt:</strong><br>`
            message += totalHours.toString().padStart(2, "0") + ":" + totalMinutes.toString().padStart(2, "0") + "<br>";
            // message += `${totalDuration.hours()+":"+totalDuration.minutes().toString().padStart(2, "0")}<br>`
            message += `<strong>Dage:</strong><br>`
            message += workDays.join("<br>")
            message += `<hr>`
        }) 

        var maillist = [
            'nobel@exzentriq.dk',
            'skafte@exzentriq.dk',
            'kasper@exzentriq.dk'
        ]

        var mailOptions = {
        from: '"Exzentriq Timeseddel 👻"',
        to: maillist,
        subject: '"Exzentriq Timeseddel 👻"',
        text: message,
        html: message
        }
    
        var transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: "larsnprivat@gmail.com",
                pass: "izgclhitzariohao"
            }
        })
        
        transporter.sendMail(mailOptions, (error, info) => {
            if (error) console.error(error)
            else console.log("email sent: " + info.response)
        })
    })
    .catch(err => {
        console.error(err)
    })
});
  
//Connect to database
mongoose.set('strictQuery', false);
mongoose.connect(process.env.MONGODBURL, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(console.log("Mongo DB Connected"))
    .catch(err => console.log(err))



// Creating server
app.listen("3000", () => {
    console.log("server running on port 3000")
    const query = {username: 'Admin'} 
    const update = {$setOnInsert: {username: 'Admin', password: '$2a$10$.L6StaMjStz8EGSyE134wu3F/aDyWitAm3bCxWGgIuNAX/mDd4Ni6', role: 'admin'}} 
    const options = {upsert: true} 
    Users.updateOne(query, update, options)
    .catch(err => console.log(err))
})