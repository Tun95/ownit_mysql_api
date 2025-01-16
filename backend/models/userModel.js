import db from "../db/knex.js";
import crypto from "crypto";
import slugify from "slugify";
import bcrypt from "bcryptjs";

const UserModel = {
  async create(userData) {
    // Generate a slug from the first and last name
    const slug = slugify(`${userData.first_name} ${userData.last_name}`, {
      lower: true,
      remove: null,
    });

    const dataWithSlug = { ...userData, slug };

    try {
      // Insert the user into the database without using returning()
      await db("users").insert(dataWithSlug);

      // Retrieve the newly created user by email to get the ID
      const user = await this.findByEmail(userData.email);

      if (!user) {
        throw new Error("Failed to retrieve user ID after insertion.");
      }

      const { id, first_name, last_name } = user;

      // After creating user, handle duplicate slug generation
      await this.generateUniqueSlug(id, first_name, last_name);

      // Return the newly created user
      return user;
    } catch (error) {
      throw new Error(`Failed to create user: ${error.message}`);
    }
  },

  async isPasswordMatch(plainPassword, hashedPassword) {
    return bcrypt.compare(plainPassword, hashedPassword);
  },

  async findByEmail(email) {
    if (typeof email !== "string" || !email) {
      throw new Error("Invalid email format.");
    }

    const user = await db("users").where({ email }).first();
    return user;
  },

  async findOne(query) {
    const user = await db("users").where(query).first();
    return user;
  },

  async findById(id) {
    const user = await db("users").where({ id }).first();
    return user;
  },

  async findAll() {
    const users = await db("users");
    return users;
  },

  async updateUser(id, updateData) {
    await db("users").where({ id }).update(updateData);
    const user = await db("users").where({ id }).first();
    return user;
  },

  async deleteUser(id) {
    await db("users").where({ id }).del();
    return { message: "User deleted successfully" };
  },

  async createPasswordResetToken(email) {
    const user = await this.findByEmail(email);
    if (!user) {
      throw new Error("User not found");
    }

    // Generate a secure reset token
    const resetToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");

    // Set token expiration (e.g., 1 hour from now)
    const expires = new Date(Date.now() + 3600000); // 1 hour

    // Save token and expiration in the database
    await db("users").where({ email }).update({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: expires,
    });

    return resetToken;
  },

  // Method to find user by reset token and check expiration
  async findUserByResetToken(hashedToken) {
    const user = await db("users")
      .where({ resetPasswordToken: hashedToken })
      .andWhere("resetPasswordExpires", ">", new Date())
      .first();
    return user;
  },

  // Method to update the user's password
  async updatePassword(id, newPassword) {
    await db("users").where({ id }).update({
      password: newPassword,
      resetPasswordToken: null,
      resetPasswordExpires: null,
    });
  },

  // Generate unique slug if there are duplicates
  async generateUniqueSlug(id, firstName, lastName) {
    let fullName = `${firstName} ${lastName}`;
    let baseSlug = fullName
      .toLowerCase()
      .replace(/ /g, "-")
      .replace(/[^\w-]+/g, "");

    const existingUser = await db("users").where({ slug: baseSlug }).first();

    if (existingUser) {
      let counter = 1;
      while (
        await db("users")
          .where({ slug: `${baseSlug}-${counter}` })
          .first()
      ) {
        counter++;
      }
      // Update with unique slug
      await db("users")
        .where({ id })
        .update({
          slug: `${baseSlug}-${counter}`,
        });
    } else {
      await db("users").where({ id }).update({
        slug: baseSlug,
      });
    }
  },

  // Method to create the account verification OTP
  async createAccountVerificationOtp(id) {
    // Generate a random 6-digit verification code
    const verificationCode = Math.floor(
      100000 + Math.random() * 900000
    ).toString();

    // Generate expiration time as a valid Date object
    const expirationTime = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

    // Update the user with OTP and its expiration
    await db("users").where({ id }).update({
      accountVerificationOtp: verificationCode,
      accountVerificationOtpExpires: expirationTime, // Store as Date
    });

    return verificationCode;
  },
  // Method to find user by OTP and check expiration
  async findUserByOtp(otp) {
    const user = await db("users")
      .where({ accountVerificationOtp: otp })
      .andWhere("accountVerificationOtpExpires", ">", new Date())
      .first();
    return user;
  },
  // Method to verify the user account
  async verifyUserAccount(id) {
    await db("users").where({ id }).update({
      isAccountVerified: true,
      accountVerificationOtp: null,
      accountVerificationOtpExpires: null,
    });
  },
};

export default UserModel;
