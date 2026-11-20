
require("dotenv").config();

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { User } = require("./src/models");

async function resetAdminPassword() {
  try {
    // Step 1: MongoDB connection
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI is missing in backend/.env");
    }

    await mongoose.connect(process.env.MONGO_URI);

    console.log("\n========== DATABASE DETAILS ==========");
    console.log("Connected Database:", mongoose.connection.name);
    console.log("User Collection:", User.collection.name);

    // Step 2: Find admin account
    const email = "m1@gmail.com";

    const user = await User.findOne({
      email: email,
    });

    // Step 3: Show account details
    console.log("\n========== USER DETAILS ==========");

    console.log(
      "Found User:",
      user
        ? {
            email: user.email,
            role: user.role,
          }
        : "User not found"
    );

    // Step 4: Check user
    if (!user) {
      console.log("\nUser not found in this database!");
      return;
    }

    if (String(user.role).toLowerCase() !== "admin") {
      console.log("\nThis account is not an admin!");
      console.log("Actual role:", user.role);
      return;
    }

    // Step 5: Reset password
    const newPassword = "Admin@123456";

    const hashedPassword = await bcrypt.hash(newPassword, 12);

    user.password = hashedPassword;

    await user.save();

    console.log("\n========== SUCCESS ==========");
    console.log("Admin password reset successfully!");
    console.log("Email:", email);
    console.log("New Password:", newPassword);
  } catch (error) {
    console.error("\nERROR:", error.message);
  } finally {
    await mongoose.disconnect();
  }
}

resetAdminPassword();
