import jwt from "jsonwebtoken";
import UserModel from "./models/userModel.js";

// Generate JWT token
export const generateToken = (user) => {
  const expiresIn = user.is_admin ? "2h" : "24h";

  return jwt.sign(
    {
      id: user.id,
      firstName: user.first_name,
      lastName: user.last_name,
      image: user.image,
      email: user.email,
      isAdmin: user.is_admin,
      role: user.role,
    },
    process.env.JWT_SECRET || "somethingsecret",
    { expiresIn }
  );
};

// Middleware to check if user is authenticated
export const isAuth = async (req, res, next) => {
  const authorization = req.headers.authorization;
  if (authorization) {
    const token = authorization.slice(7, authorization.length); // Remove 'Bearer ' from the token
    jwt.verify(
      token,
      process.env.JWT_SECRET || "somethingsecret",
      async (err, decode) => {
        if (err) {
          return res
            .status(401)
            .send({ message: "Unauthorized: Invalid or expired token" });
        }
        try {
          // Fetch the user data from the database
          const user = await UserModel.findById(decode.id);
          if (!user) {
            return res.status(404).send({ message: "User not found" });
          }

          // Set the complete user data in req.user
          req.user = {
            id: user.id,
            firstName: user.first_name,
            lastName: user.last_name,
            email: user.email,
            image: user.image,
            isAdmin: user.is_admin,
            role: user.role,
            isBlocked: user.is_blocked,
            isAccountVerified: user.isAccountVerified,
          };

          next();
        } catch (error) {
          res.status(500).send({ message: "Internal server error" });
        }
      }
    );
  } else {
    res.status(401).send({ message: "Unauthorized: No token provided" });
  }
};

// Middleware to check if user has admin privileges
export const isAdmin = (req, res, next) => {
  if (req.user && req.user.isAdmin) {
    next();
  } else {
    res.status(403).send({
      message: "Forbidden: You do not have admin privileges",
    });
  }
};

// Middleware to check if user has one of the allowed roles
export const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (req.user && allowedRoles.includes(req.user.role)) {
      next();
    } else {
      res.status(403).send({
        message:
          "Forbidden: You do not have the required role to access this resource",
      });
    }
  };
};
