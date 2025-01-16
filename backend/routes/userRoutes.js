import express from "express";
import bcrypt from "bcryptjs";
import { authorizeRoles, generateToken, isAdmin, isAuth } from "../utils.js";
import expressAsyncHandler from "express-async-handler";
import UserModel from "../models/userModel.js";
import nodemailer from "nodemailer";
import crypto from "crypto";

const userRouter = express.Router();

//=================
// Admin Signup route
//=================
userRouter.post(
  "/admin/signup",
  expressAsyncHandler(async (req, res) => {
    const { firstName, lastName, email, password, role } = req.body;

    try {
      // Check if the user already exists
      const existingUser = await UserModel.findByEmail(email);
      if (existingUser) {
        return res.status(400).json({ message: "User already exists" });
      }

      // Hash the password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Check if this is the first user signing up
      const users = await UserModel.findAll();
      const isFirstUser = users.length === 0;

      // Determine role and admin status
      const userRole = isFirstUser ? "admin" : role || "user";
      const isAdmin = isFirstUser || userRole === "admin";

      // Create a new user
      const user = await UserModel.create({
        first_name: firstName,
        last_name: lastName,
        email,
        password: hashedPassword,
        is_admin: isAdmin,
        role: userRole,
      });

      // Generate a token and return user data
      res.status(201).json({
        message: "User created successfully",
        user: {
          id: user.id,
          firstName: user.first_name,
          lastName: user.last_name,
          email: user.email,
          role: user.role,
          isAdmin: user.is_admin,
        },
        token: generateToken(user),
      });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  })
);

//=================
// Admin Login route
//=================
userRouter.post(
  "/admin/signin",
  expressAsyncHandler(async (req, res) => {
    try {
      const { email, password } = req.body;
      console.log("Admin Login Attempt:", { email, password });

      const admin = await UserModel.findByEmail(email);

      if (!admin) {
        return res
          .status(401)
          .send({ message: "No admin found with this email" });
      }

      if (admin.is_blocked) {
        return res.status(403).send({
          message: "😲 It appears this account has been blocked by Admin",
        });
      }

      if (!admin.isAccountVerified) {
        return res.status(401).send({ message: "Account not verified" });
      }
      // Compare passwords
      const isPasswordMatch = await UserModel.isPasswordMatch(
        password,
        admin.password
      );

      if (isPasswordMatch) {
        console.log("Password Match Successful");

        return res.send({
          _id: admin.id, // Use `id` as per the table definition
          firstName: admin.first_name,
          lastName: admin.last_name,
          email: admin.email,
          image: admin.image,
          isAdmin: admin.is_admin, // Use `is_admin` flag
          role: admin.role,
          isBlocked: admin.is_blocked, // Use `is_blocked`
          isAccountVerified: admin.isAccountVerified,
          token: generateToken(admin),
        });
      }
      console.log("Password Match Failed");
      res.status(401).send({ message: "Invalid email or password" });
    } catch (error) {
      console.error(error);
      res.status(500).send({ message: "Internal server error" });
    }
  })
);

//===========
// USER SIGNUP
//===========
userRouter.post(
  "/signup",
  expressAsyncHandler(async (req, res) => {
    const { firstName, lastName, email, password } = req.body;

    try {
      // Check if the user already exists
      const existingUser = await UserModel.findByEmail(email);
      if (existingUser) {
        return res.status(400).json({ message: "User already exists" });
      }

      // Hash the password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create the new user with the default role
      const user = await UserModel.create({
        first_name: firstName,
        last_name: lastName,
        email,
        password: hashedPassword,
        role: "user",
        is_admin: false,
        is_blocked: false,
        isAccountVerified: false,
      });

      // Generate a token and return user data
      res.status(201).json({
        message: "User created successfully",
        user: {
          id: user.id,
          firstName: user.first_name,
          lastName: user.last_name,
          email: user.email,
          role: user.role,
          isAdmin: user.is_admin,
          isBlocked: user.is_blocked,
          isAccountVerified: user.isAccountVerified,
        },
        token: generateToken(user),
      });
    } catch (error) {
      console.error("Error during user signup:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  })
);
//============
// USER SIGN IN
//============
userRouter.post(
  "/signin",
  expressAsyncHandler(async (req, res) => {
    try {
      const { email, password } = req.body;

      // Find user by email
      const user = await UserModel.findByEmail(email);
      if (!user) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      // Check if the user is blocked
      if (user.is_blocked) {
        return res.status(403).json({
          message: "😲 It appears this account has been blocked by Admin",
        });
      }

      // Check if the account is verified
      if (!user.isAccountVerified) {
        return res.status(401).json({ message: "Account not verified" });
      }

      // Compare passwords
      const isPasswordMatch = await UserModel.isPasswordMatch(
        password,
        user.password
      );
      if (!isPasswordMatch) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      // Generate and return user data with token
      res.json({
        id: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        image: user.image,
        isAdmin: user.is_admin,
        role: user.role,
        isBlocked: user.is_blocked,
        isAccountVerified: user.isAccountVerified,
        token: generateToken(user),
      });
    } catch (error) {
      console.error("Error during user signin:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  })
);

//===================
// ADMIN ADD NEW USER ROUTE
//===================
userRouter.post(
  "/add-user",
  isAuth,
  isAdmin,
  expressAsyncHandler(async (req, res) => {
    const facebook = process.env.FACEBOOK_PROFILE_LINK;
    const instagram = process.env.INSTAGRAM_PROFILE_LINK;
    const webName = process.env.WEB_NAME;

    const { firstName, lastName, email, password, role } = req.body;

    const existingUser = await UserModel.findByEmail(email);
    if (existingUser) {
      return res
        .status(400)
        .send({ message: "User with this email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = {
      first_name: firstName,
      last_name: lastName,
      email,
      role,
      password: hashedPassword,
    };

    try {
      // Create the new user
      const createdUser = await UserModel.create(newUser);

      // Generate and save OTP for account verification
      const otp = await UserModel.createAccountVerificationOtp(createdUser.id);

      const emailMessage = `<html >
      <head>
       <style>
         body {
           font-family: Arial, sans-serif;
           margin: 0;
           padding: 0;
           box-sizing: border-box;
         }
         .container {
           width: 100%;
           max-width: 600px;
           margin: auto;
         }
         a { text-decoration: none; }

         .a_flex {
           display: flex;
           align-items: center;
         }

         .header {
           background-color: #00463e;
           height: 50px;
           width: 100%;
           display: flex;
           justify-content: center;
           align-items: center;
         }

         .logo_img {
           width: 100px;
         }
         .head {
           flex-direction: column;
         }
        .email{
           width:200px
         }
         .message_text {
           padding: 0px 10px;
         }
         .message_text p {
           color: #434343;
           font-size: 15px;
         }
         .message_text .otp_box {
           margin: -18px 0px;
         }
         .otp_box h2 {
           background-color: #e7e7e7;
           color: #3462fa;
           padding: 5px 10px;
           border-radius: 5px;
           letter-spacing: 3px;
           width: fit-content;
         }
         .out_greeting h5 {
           line-height: 2px;
           font-size: 15px;
           color: #222222;
         }
         .footer {
           border-top: 1px solid #a5a5a5;
         }
         .footer img {
           width: 30px;
         }
         .footer p{
           font-size: 16px;
         }
       </style>
     </head>
     <body>
       <div class="container">
         <div class="header">
           <table role="presentation" width="100%">
           <tr>
             <td align="center">
               <img
                 src="https://res.cloudinary.com/dtvwnonbi/image/upload/v1730887212/logo_oodxma.png"
                 alt="logo"
                 width="100"
                 style="display: block;"
               />
             </td>
           </tr>
         </table>
         </div>
         <div class="body_text">
           <div class="head ">
            <table role="presentation" width="100%">
             <tr>
             <td align="center">
               <img
                 src="https://res.cloudinary.com/dtvwnonbi/image/upload/v1730886761/ed1_xpf1zq.png"
                 alt="email"
                 class="email"
               />
              </td>

             </tr>
             <tr>
               <td align="center">
                <div class="head_text">
                <h2>Account Verification</h2>
                </div>
               </td>
              </tr>
            </table>
           </div>
           <div class="message_text">
             <div class="greetings">
               <h3>Hi ${newUser.first_name},</h3>
             </div>
             <div class="text">
               <p>
                 You have received this email because you have been requested to
                 verify your account.
               </p>
               <table role="presentation" width="100%" style="padding: -10px 0px; margin: -15px 0px;">
                <tr>
                 <td align="center"  style="padding: -10px 0px; margin: -15px 0px;">
                  <div class="otp_box">
                   <h2>${otp}</h2>
                  </div>
                 </td>
                 </tr>
                </table>
              <p>Your password is: <strong>${password}</strong></p>
               <p>
                 If you did not request this verification, you can safely ignore
                 this email.
               </p>
               <p>This verification code is valid for the next 10 minutes.</p>
             </div>
             <div class="out_greeting">
               <h5>Regards,</h5>
               <h5 class="closing">The ${webName} Team.</h5>
             </div>
           </div>
         </div>
         <div class="footer">
           <table role="presentation" width="100%">
             <tr>
               <td align="left" style="padding: 10px;">
                 <p style="margin: 0;">Edquity by Outside Lab</p>
               </td>
               <td align="right" style="padding: 10px;">
                 <a href="${facebook}" style="margin-right: 10px;">
                   <img
                     src="https://res.cloudinary.com/dtvwnonbi/image/upload/v1730886760/face_z4zb3n.png"
                     alt="Facebook"
                     width="30"
                     style="display: inline-block; vertical-align: middle;"
                   />
                 </a>
                 <a href="${instagram}">
                   <img
                     src="https://res.cloudinary.com/dtvwnonbi/image/upload/v1730886761/insta_olwhmd.png"
                     alt="Instagram"
                     width="30"
                     style="display: inline-block; vertical-align: middle;"
                   />
                 </a>
               </td>
             </tr>
           </table>
         </div>

       </div>
     </body>
   </html>`;

      // Configure Nodemailer transport
      const smtpTransport = nodemailer.createTransport({
        service: process.env.MAIL_SERVICE,
        auth: {
          user: process.env.EMAIL_ADDRESS,
          pass: process.env.EMAIL_PASS,
        },
      });

      // Email options
      const mailOptions = {
        to: createdUser.email,
        from: `${webName} <${process.env.EMAIL_ADDRESS}>`,
        subject: "Account Verification",
        html: emailMessage,
      };

      // Send email with Nodemailer
      await smtpTransport.sendMail(mailOptions);

      res.status(201).send({
        message: "User created. Verification email sent.",
        userId: createdUser.id,
      });
    } catch (error) {
      console.error("Failed to send email", error);
      res.status(500).json({ message: "Failed to send email" });
    }
  })
);

//=================================
// Route to handle OTP generation and email verification for user registration and login
//=================================
userRouter.post(
  "/otp-verification",
  expressAsyncHandler(async (req, res) => {
    const facebook = process.env.FACEBOOK_PROFILE_LINK;
    const instagram = process.env.INSTAGRAM_PROFILE_LINK;
    const webName = process.env.WEB_NAME;

    try {
      // Get user information from the registration request
      const { email } = req.body;

      // Validate email format
      if (!email || !/\S+@\S+\.\S+/.test(email)) {
        return res.status(400).json({ message: "Invalid email format" });
      }

      // Find the user by email in the database
      const user = await UserModel.findByEmail(email);

      // Check if the user exists
      if (!user) {
        return res.status(400).json({ message: "User not found" });
      }

      // Generate and save OTP for account verification
      const verificationOtp = await UserModel.createAccountVerificationOtp(
        user.id
      );
      // user.verificationOtp = verificationOtp; // Save OTP to the user document
      // await user.save();

      const emailMessage = `<html >
                <head>
                  <style>
                    body {
                      font-family: Arial, sans-serif;
                      margin: 0;
                      padding: 0;
                      box-sizing: border-box;
                    }
                    .container {
                      width: 100%;
                      max-width: 600px;
                      margin: auto;
                    }
                    a { text-decoration: none; }
                   
                    .a_flex {
                      display: flex;
                      align-items: center;
                    }
                 
                    .header {
                      background-color: #00463e;
                      height: 50px;
                      width: 100%;
                      display: flex;
                      justify-content: center;
                      align-items: center;
                    }
                   
                    .logo_img {
                      width: 100px;
                    }
                    .head {
                      flex-direction: column;
                    }
                   .email{
                      width:200px
                    }
                    .message_text {
                      padding: 0px 10px;
                    }
                    .message_text p {
                      color: #434343;
                      font-size: 15px;
                    }
                    .message_text .otp_box {
                      margin: -18px 0px;
                    }
                    .otp_box h2 {
                      background-color: #e7e7e7;
                      color: #3462fa;
                      padding: 5px 10px;
                      border-radius: 5px;
                      letter-spacing: 3px;
                      width: fit-content;
                    }
                    .out_greeting h5 {
                      line-height: 2px;
                      font-size: 15px;
                      color: #222222;
                    }
                    .footer {
                      border-top: 1px solid #a5a5a5;
                    }
                    .footer img {
                      width: 30px;
                    }
                    .footer p{
                      font-size: 16px;
                    }
                  </style>
                </head>
                <body>
                  <div class="container">
                    <div class="header">
                      <table role="presentation" width="100%">
                      <tr>
                        <td align="center">
                          <img
                            src="https://res.cloudinary.com/dtvwnonbi/image/upload/v1730887212/logo_oodxma.png"
                            alt="logo"
                            width="100"
                            style="display: block;"
                          />
                        </td>
                      </tr>
                    </table>
                    </div>
                    <div class="body_text">
                      <div class="head ">
                       <table role="presentation" width="100%">
                        <tr>
                        <td align="center">
                          <img
                            src="https://res.cloudinary.com/dtvwnonbi/image/upload/v1730886761/ed1_xpf1zq.png"
                            alt="email"
                            class="email"
                          />
                         </td>
                        
                        </tr>
                        <tr>
                          <td align="center">
                           <div class="head_text">
                           <h2>Email Verification</h2>
                           </div>
                          </td> 
                         </tr>
                       </table>
                      </div>
                      <div class="message_text">
                        <div class="greetings">
                          <h3>Hi ${user.first_name},</h3>
                        </div>
                        <div class="text">
                          <p>
                            You have received this email because you have been requested to
                            verify your account.
                          </p>
                          <table role="presentation" width="100%" style="padding: -10px 0px; margin: -15px 0px;">
                           <tr>
                            <td align="center"  style="padding: -10px 0px; margin: -15px 0px;">
                             <div class="otp_box">
                              <h2>${verificationOtp}</h2>
                             </div>
                            </td>
                            </tr>
                           </table>
                          <p>
                            If you did not request this verification, you can safely ignore
                            this email.
                          </p>
                          <p>This verification code is valid for the next 10 minutes.</p>
                        </div>
                        <div class="out_greeting">
                          <h5>Regards,</h5>
                          <h5 class="closing">The ${webName} Team.</h5>
                        </div>
                      </div>
                    </div>
                    <div class="footer">
                      <table role="presentation" width="100%">
                        <tr>
                          <td align="left" style="padding: 10px;">
                            <p style="margin: 0;">Edquity by Outside Lab</p>
                          </td>
                          <td align="right" style="padding: 10px;">
                            <a href="${facebook}" style="margin-right: 10px;">
                              <img
                                src="https://res.cloudinary.com/dtvwnonbi/image/upload/v1730886760/face_z4zb3n.png"
                                alt="Facebook"
                                width="30"
                                style="display: inline-block; vertical-align: middle;"
                              />
                            </a>
                            <a href="${instagram}">
                              <img
                                src="https://res.cloudinary.com/dtvwnonbi/image/upload/v1730886761/insta_olwhmd.png"
                                alt="Instagram"
                                width="30"
                                style="display: inline-block; vertical-align: middle;"
                              />
                            </a>
                          </td>
                        </tr>
                      </table>
                    </div>
  
                  </div>
                </body>
              </html>`;

      // Configure Nodemailer transport
      const smtpTransport = nodemailer.createTransport({
        service: process.env.MAIL_SERVICE,
        auth: {
          user: process.env.EMAIL_ADDRESS,
          pass: process.env.EMAIL_PASS,
        },
      });

      // Email options
      const mailOptions = {
        to: user.email,
        from: `${webName} <${process.env.EMAIL_ADDRESS}>`,
        subject: "Verify your email address",
        html: emailMessage,
      };

      // Send the email
      await smtpTransport.sendMail(mailOptions);

      res.status(200).json({ message: "Verification email sent successfully" });
    } catch (error) {
      console.log(error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  })
);

//===============
//OTP Verification
//===============
userRouter.put(
  "/verify-otp",
  expressAsyncHandler(async (req, res) => {
    const { otp } = req.body;

    try {
      // Validate OTP format (Optional)
      if (!otp || otp.length !== 6 || !/^\d+$/.test(otp)) {
        return res.status(400).json({ message: "Invalid OTP format" });
      }

      // Find user by OTP and check if the entered OTP matches
      const userFound = await UserModel.findUserByOtp(otp);

      if (!userFound) {
        return res
          .status(400)
          .json({ message: "Invalid OTP or OTP expired. Please try again." });
      }

      // Mark the user as verified and clear OTP-related fields
      await UserModel.verifyUserAccount(userFound.id);

      res.json({
        message: "OTP successfully verified.",
        isAccountVerified: true,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  })
);

//=================
// Fetch all users
//=================
userRouter.get(
  "/",
  isAuth,
  isAdmin,
  authorizeRoles("admin", "teacher"),
  expressAsyncHandler(async (req, res) => {
    try {
      const users = await UserModel.findAll();
      res.json(users);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  })
);

//=================
// Get user profile details
//=================
userRouter.get(
  "/profile",
  isAuth,
  expressAsyncHandler(async (req, res) => {
    try {
      const user = await UserModel.findById(req.user.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json(user);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  })
);

//=================
// Get user details by ID
//=================
userRouter.get(
  "/:id",
  isAuth,
  expressAsyncHandler(async (req, res) => {
    try {
      const user = await UserModel.findById(req.params.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json(user);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  })
);

//=================
// Get user profile details by slug
//=================
userRouter.get(
  "/slug/:slug",
  // isAuth,
  expressAsyncHandler(async (req, res) => {
    try {
      const user = await UserModel.findOne({ slug: req.params.slug });
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json(user);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  })
);

//=================
// Admin: Get all users
//=================
userRouter.get(
  "/users",
  isAuth,
  isAdmin,
  expressAsyncHandler(async (req, res) => {
    try {
      const users = await UserModel.findAll({});
      res.json(users);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  })
);

//=================
// Admin: Delete user by ID
//=================
userRouter.delete(
  "/:id",
  isAuth,
  isAdmin,
  expressAsyncHandler(async (req, res) => {
    const { id } = req.params;

    try {
      const user = await UserModel.findById(id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      await UserModel.deleteUser(id);

      res.status(200).json({ message: "User deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  })
);

//===============
//Password Reset Token
//===============
userRouter.post(
  "/password-token",
  expressAsyncHandler(async (req, res) => {
    const facebook = process.env.FACEBOOK_PROFILE_LINK;
    const instagram = process.env.INSTAGRAM_PROFILE_LINK;
    const webName = process.env.WEB_NAME;

    const { email } = req.body;

    try {
      const user = await UserModel.findByEmail(email);
      // Check if the user exists
      if (!user) {
        return res.status(400).json({ message: "User not found" });
      }
      const token = await UserModel.createPasswordResetToken(email);
      console.log("TOKEN:", token);
      // HTML message
      const resetURL = `<html >
                  <head>
                  <style>
                    body {
                      font-family: Arial, sans-serif;
                      margin: 0;
                      padding: 0;
                      box-sizing: border-box;
                    }
                    .container {
                      width: 100%;
                      max-width: 600px;
                      margin: auto;
                    }
                    a { text-decoration: none; }
                    
                    .a_flex {
                      display: flex;
                      align-items: center;
                    }
                  
                    .header {
                      background-color: #00463e;
                      height: 50px;
                      width: 100%;
                      display: flex;
                      justify-content: center;
                      align-items: center;
                    }
                    
                    .logo_img {
                      width: 100px;
                    }
                    .head {
                      flex-direction: column;
                      margin-top: 20px;
                    }
                    .email{
                      width:200px
                    }
                    .message_text {
                      padding: 0px 10px;
                    }
                    .message_text p {
                      color: #434343;
                      font-size: 15px;
                    }
                    .message_text .otp_box {
                      margin: -18px 0px;
                    }
                    .otp_box h2 {
                      background-color: #e7e7e7;
                      color: #3462fa;
                      padding: 5px 10px;
                      border-radius: 5px;
                      letter-spacing: 3px;
                      width: fit-content;
                    }
                    .out_greeting h5 {
                      line-height: 2px;
                      font-size: 15px;
                      color: #222222;
                    }
                    .footer {
                      border-top: 1px solid #a5a5a5;
                    }
                    .footer img {
                      width: 30px;
                    }
                    .footer p{
                      font-size: 16px;
                    }
                  </style>
                </head>
                <body>
                  <div class="container">
                    <div class="header">
                      <table role="presentation" width="100%">
                      <tr>
                        <td align="center">
                          <img
                            src="https://res.cloudinary.com/dtvwnonbi/image/upload/v1730887212/logo_oodxma.png"
                            alt="logo"
                            width="100"
                            style="display: block;"
                          />
                        </td>
                      </tr>
                    </table>
                    </div>
                    <div class="body_text">
                      <div class="head ">
                        <table role="presentation" width="100%">
                        <tr>
                        <td align="center">
                          <img
                            src="https://res.cloudinary.com/dtvwnonbi/image/upload/v1730886761/ed2_rwigks.png"
                            alt="email"
                            class="email"
                          />
                          </td>
                        
                        </tr>
                        <tr>
                          <td align="center">
                            <div class="head_text">
                            <h2>Reset Your Password</h2>
                            </div>
                          </td> 
                          </tr>
                        </table>
                      </div>
                      <div class="message_text">
                        <div class="greetings">
                          <h3>Hi ${user.first_name},</h3>
                        </div>
                        <div class="text">
                          <p>
                            You recently requested to reset your password. If you did not make this request, Kindly ignore this email.
                          </p>
                        
                          <p>
                           To reset your password, please click the button below.
                          </p>
                          <table role="presentation" width="100%" style="padding: -10px 0px; margin: -15px 0px;">
                           <tr>
                            <td align="center"  style="padding: -10px 0px; margin: -15px 0px;">
                             <a href=${`${process.env.SUB_DOMAIN}/${user.id}/new-password/${token}`} style="display: inline-block; margin: 8px 0; padding: 8px 30px; background-color: #00eacd; color: #000B09; text-decoration: none; border-radius: 4px;">Reset Password</a>
                           </td>
                          </tr>
                         </table>
                          </div>
                        <div class="out_greeting">
                          <h5>Regards,</h5>
                          <h5 class="closing">The ${webName} Team.</h5>
                        </div>
                      </div>
                    </div>
                    <div class="footer">
                      <table role="presentation" width="100%">
                        <tr>
                          <td align="left" style="padding: 10px;">
                            <p style="margin: 0;">Edquity by Outside Lab</p>
                          </td>
                          <td align="right" style="padding: 10px;">
                            <a href="${facebook}" style="margin-right: 10px;">
                              <img
                                src="https://res.cloudinary.com/dtvwnonbi/image/upload/v1730886760/face_z4zb3n.png"
                                alt="Facebook"
                                width="30"
                                style="display: inline-block; vertical-align: middle;"
                              />
                            </a>
                            <a href="${instagram}">
                              <img
                                src="https://res.cloudinary.com/dtvwnonbi/image/upload/v1730886761/insta_olwhmd.png"
                                alt="Instagram"
                                width="30"
                                style="display: inline-block; vertical-align: middle;"
                              />
                            </a>
                          </td>
                        </tr>
                      </table>
                    </div>
  
                  </div>
                </body>
              </html>`;

      // Configure Nodemailer transport
      const smtpTransport = nodemailer.createTransport({
        service: process.env.MAIL_SERVICE,
        auth: {
          user: process.env.EMAIL_ADDRESS,
          pass: process.env.EMAIL_PASS,
        },
      });

      // Email options
      const mailOptions = {
        to: user.email,
        from: `${webName} <${process.env.EMAIL_ADDRESS}>`,
        subject: "Reset Password",
        html: resetURL,
      };

      // Send the email
      await smtpTransport.sendMail(mailOptions);

      res.status(200).json({
        message: `A verification email has been successfully sent to ${user?.email}. Reset now within 10 minutes.`,
      });
    } catch (error) {
      res.send(error);
    }
  })
);

//===============
//Password Reset
//===============
userRouter.put(
  "/:id/reset-password",
  expressAsyncHandler(async (req, res) => {
    const facebook = process.env.FACEBOOK_PROFILE_LINK;
    const instagram = process.env.INSTAGRAM_PROFILE_LINK;
    const webName = process.env.WEB_NAME;

    const { token, password } = req.body;
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    // Log token details for debugging
    console.log("Received Token:", token);
    console.log("Hashed Token:", hashedToken);

    try {
      // Find user by hashed token and check if token is still valid
      const user = await UserModel.findUserByResetToken(hashedToken);

      if (!user) {
        console.log("Invalid token or token expired");
        return res.status(400).json({
          message: "Invalid token or token expired, please try again",
        });
      }

      // Check if the new password is the same as the old password
      const isSamePassword = await UserModel.isPasswordMatch(
        password,
        user.password
      );
      if (isSamePassword) {
        return res.status(400).json({
          message: "New password cannot be the same as the old password",
        });
      }

      // Update user password
      const hashedNewPassword = bcrypt.hashSync(password, 10);
      await UserModel.updatePassword(user.id, hashedNewPassword);

      const emailMessage = `<html >
        <head>
          <style>
            body {
              font-family: Arial, sans-serif;
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            .container {
              width: 100%;
              max-width: 600px;
              margin: auto;
            }
            a { text-decoration: none;
                color: #0062EA;
             }

            .a_flex {
              display: flex;
              align-items: center;
            }

            .header {
              background-color: #00463e;
              height: 50px;
              width: 100%;
              display: flex;
              justify-content: center;
              align-items: center;
            }

            .logo_img {
              width: 100px;
            }
            .head {
              flex-direction: column;
            }
           .email{
              width: 110px;
              margin-top: 10px;
            }
            .message_text {
              padding: 0px 10px;
            }
            .message_text p {
              color: #434343;
              font-size: 15px;
            }
            .message_text .otp_box {
              margin: -18px 0px;
            }
            .otp_box h2 {
              background-color: #e7e7e7;
              color: #3462fa;
              padding: 5px 10px;
              border-radius: 5px;
              letter-spacing: 3px;
              width: fit-content;
            }
            .out_greeting h5 {
              line-height: 2px;
              font-size: 15px;
              color: #222222;
            }
            .footer {
              border-top: 1px solid #a5a5a5;
            }
            .footer img {
              width: 30px;
            }
            .footer p{
              font-size: 16px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <table role="presentation" width="100%">
              <tr>
                <td align="center">
                  <img
                    src="https://res.cloudinary.com/dtvwnonbi/image/upload/v1730887212/logo_oodxma.png"
                    alt="logo"
                    width="100"
                    style="display: block;"
                  />
                </td>
              </tr>
            </table>
            </div>
            <div class="body_text">
              <div class="head ">
               <table role="presentation" width="100%">
                <tr>
                <td align="center">
                  <img
                    src="https://res.cloudinary.com/dtvwnonbi/image/upload/v1730886761/ed3_y1xwb9.png"
                    alt="email"
                    class="email"
                  />
                 </td>

                </tr>
                <tr>
                  <td align="center">
                   <div class="head_text">
                   <h2>Password Reset Complete</h2>
                   </div>
                  </td>
                 </tr>
               </table>
              </div>
              <div class="message_text">
                <div class="greetings">
                  <h3>Hi ${user.firstName},</h3>
                </div>
                <div class="text">
                  <p>
                    The password for your Telex account has been successfully changed. You can now access your account  <a href=${`${process.env.SUB_DOMAIN}/lost-password`}>here</a>.
                  </p>
                  <p>
                   If you didn't change your password, please immediately reset your Telex account by clicking on the link: <a href=${`${process.env.SUB_DOMAIN}/lost-password`}>${
        process.env.SUB_DOMAIN
      }/lost-password</a>
                  </p>

                </div>
                <div class="out_greeting">
                  <h5>Regards,</h5>
                  <h5 class="closing">The ${webName} Team.</h5>
                </div>
              </div>
            </div>
            <div class="footer">
              <table role="presentation" width="100%">
                <tr>
                  <td align="left" style="padding: 10px;">
                    <p style="margin: 0;">Edquity by Outside Lab</p>
                  </td>
                  <td align="right" style="padding: 10px;">
                    <a href="${facebook}" style="margin-right: 10px;">
                      <img
                        src="https://res.cloudinary.com/dtvwnonbi/image/upload/v1730886760/face_z4zb3n.png"
                        alt="Facebook"
                        width="30"
                        style="display: inline-block; vertical-align: middle;"
                      />
                    </a>
                    <a href="${instagram}">
                      <img
                        src="https://res.cloudinary.com/dtvwnonbi/image/upload/v1730886761/insta_olwhmd.png"
                        alt="Instagram"
                        width="30"
                        style="display: inline-block; vertical-align: middle;"
                      />
                    </a>
                  </td>
                </tr>
              </table>
            </div>

          </div>
        </body>
      </html>`;

      // Configure Nodemailer transport
      const smtpTransport = nodemailer.createTransport({
        service: process.env.MAIL_SERVICE,
        auth: {
          user: process.env.EMAIL_ADDRESS,
          pass: process.env.EMAIL_PASS,
        },
      });

      // Email options
      const mailOptions = {
        to: user.email,
        from: `${webName} <${process.env.EMAIL_ADDRESS}>`,
        subject: "Password Reset Successful",
        html: emailMessage,
      };

      // Send the email
      await smtpTransport.sendMail(mailOptions);

      res.status(200).json({ message: "Password reset successful" });
    } catch (error) {
      console.error("Error during password reset:", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  })
);

export default userRouter;
