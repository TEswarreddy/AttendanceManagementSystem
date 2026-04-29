const dotenv = require("dotenv");
const path = require("path");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const readline = require("readline");

dotenv.config({ path: path.join(__dirname, "../../.env") });

const { User, Department } = require("../models");

const connectDatabase = async () => {
  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    throw new Error("MONGODB_URI is required to create admin user.");
  }

  await mongoose.connect(mongoUri, {
    serverSelectionTimeoutMS: 5000,
  });

  console.log("✓ Connected to MongoDB\n");
};

const createReadlineInterface = () => {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
};

const promptUser = (rl, question) => {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
};

const promptPassword = (rl, question) => {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    stdin.resume();
    stdin.setEncoding("utf8");
    stdin.on("data", function (char) {
      char = String.fromCharCode(char);
      if (char === "\n" || char === "\r" || char === "\u0004") {
        stdin.pause();
      } else {
        process.stdout.write("*");
      }
    });

    rl.question(question, (answer) => {
      stdin.pause();
      resolve(answer);
    });
  });
};

const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const validatePassword = (password) => {
  if (password.length < 6) {
    return { valid: false, message: "Password must be at least 6 characters long" };
  }
  return { valid: true };
};

const createAdminUser = async (email, password) => {
  try {
    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      throw new Error(`User with email "${email}" already exists`);
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create admin user
    const adminUser = new User({
      email: email.toLowerCase(),
      passwordHash: hashedPassword,
      role: "admin",
      isActive: true,
    });

    await adminUser.save();

    console.log("\n✅ Admin user created successfully!");
    console.log(`\n📋 Admin User Details:`);
    console.log(`   Email: ${adminUser.email}`);
    console.log(`   Role: ${adminUser.role}`);
    console.log(`   Status: Active`);
    console.log(`\n🔑 You can now login with these credentials.`);

    return adminUser;
  } catch (error) {
    console.error("❌ Error creating admin user:", error.message);
    throw error;
  }
};

const main = async () => {
  const args = process.argv.slice(2);
  const useArgs = args.length >= 2; // email, password
  
  try {
    console.log("=====================================");
    console.log("  Create Admin/Principal User");
    console.log("=====================================\n");

    let email = "";
    let password = "";

    // If command-line args provided, use them
    if (useArgs) {
      email = args[0];
      password = args[1];

      // Validate email
      if (!validateEmail(email)) {
        throw new Error("Invalid email format");
      }

      // Validate password
      const validation = validatePassword(password);
      if (!validation.valid) {
        throw new Error(validation.message);
      }
    } else {
      // Interactive mode
      const rl = createReadlineInterface();

      // Get admin details
      let isValidEmail = false;

      while (!isValidEmail) {
        email = await promptUser(rl, "📧 Enter admin email: ");
        if (!validateEmail(email)) {
          console.log("❌ Invalid email format. Please try again.\n");
        } else {
          isValidEmail = true;
        }
      }
      let password = "";
      let isValidPassword = false;

      while (!isValidPassword) {
        process.stdout.write("🔐 Enter admin password: ");
        password = await new Promise((resolve) => {
          const stdin = process.stdin;
          stdin.setEncoding("utf8");
          let pwd = "";

          const onData = (char) => {
            if (char === "\n" || char === "\r" || char === "\u0004") {
              stdin.removeListener("data", onData);
              stdin.pause();
              console.log(); // New line after password input
              resolve(pwd);
            } else {
              pwd += char;
              process.stdout.write("*");
            }
          };

          stdin.resume();
          stdin.on("data", onData);
        });

        const validation = validatePassword(password);
        if (!validation.valid) {
          console.log(`❌ ${validation.message}\n`);
        } else {
          isValidPassword = true;
        }
      }

      // Confirm password
      let confirmPassword = "";
      let passwordsMatch = false;

      while (!passwordsMatch) {
        process.stdout.write("🔐 Confirm password: ");
        confirmPassword = await new Promise((resolve) => {
          const stdin = process.stdin;
          stdin.setEncoding("utf8");
          let pwd = "";

          const onData = (char) => {
            if (char === "\n" || char === "\r" || char === "\u0004") {
              stdin.removeListener("data", onData);
              stdin.pause();
              console.log(); // New line after password input
              resolve(pwd);
            } else {
              pwd += char;
              process.stdout.write("*");
            }
          };

          stdin.resume();
          stdin.on("data", onData);
        });

        if (password !== confirmPassword) {
          console.log("❌ Passwords do not match. Please try again.\n");
        } else {
          passwordsMatch = true;
        }
      }

      rl.close();
    }

    // Connect to database
    await connectDatabase();

    // Create admin user
    await createAdminUser(email, password);

    process.exit(0);
  } catch (error) {
    console.error("\n❌ Failed to create admin user:", error.message);
    process.exit(1);
  } finally {
    try {
      await mongoose.disconnect();
    } catch (e) {
      // Ignore disconnect errors
    }
  }
};

main();
