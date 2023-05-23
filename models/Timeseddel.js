const mongoose = require("mongoose")
var Schema = mongoose.Schema;


const timeseddelSchema = new mongoose.Schema({
    start: {
        type: String,
        required: true
    },
    end: {
        type: String,
        required: true
    },
    userId: {
        type: Schema.Types.ObjectId, 
        ref: "User"
    },
    achieved: {
        type: Boolean,
        default: false
    }
})

module.exports = mongoose.model("Timeseddel", timeseddelSchema)