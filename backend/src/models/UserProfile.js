const mongoose = require("mongoose");

const userProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    fullName: {
      type: String,
      trim: true,
      default: null,
      maxlength: 120,
    },
    phone: {
      type: String,
      trim: true,
      default: null,
      maxlength: 20,
    },
    alternatePhone: {
      type: String,
      trim: true,
      default: null,
      maxlength: 20,
    },
    gender: {
      type: String,
      trim: true,
      enum: ["male", "female", "other", null],
      default: null,
    },
    dateOfBirth: {
      type: Date,
      default: null,
    },
    address: {
      type: String,
      trim: true,
      default: null,
      maxlength: 500,
    },
    bio: {
      type: String,
      trim: true,
      default: null,
      maxlength: 1000,
    },
    profilePhoto: {
      type: String,
      trim: true,
      default: null,
      maxlength: 500,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("UserProfile", userProfileSchema);
