const mongoose = require("mongoose")
var Schema = mongoose.Schema;


const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true
    },
    password: {
        type: String,
        required: true
    },
    role: {
        type: String,
        required: true
    },
    timesedler: [{ 
        type: mongoose.Schema.Types.ObjectId,
        ref: "Timeseddel"
     }]
})

module.exports = mongoose.model("User", userSchema)