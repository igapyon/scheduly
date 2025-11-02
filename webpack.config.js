const path = require("path");
const webpack = require("webpack");

const isProduction = process.env.NODE_ENV === "production";

/** @type {import("webpack").Configuration} */
module.exports = {
  entry: {
    index: path.resolve(__dirname, "src/frontend/admin.jsx"),
    user: path.resolve(__dirname, "src/frontend/user.jsx")
  },
  output: {
    filename: "[name].bundle.js",
    path: path.resolve(__dirname, "dist"),
    publicPath: "/",
    clean: true
  },
  mode: isProduction ? "production" : "development",
  devtool: isProduction ? "source-map" : "eval-source-map",
  resolve: {
    extensions: [".js", ".jsx", ".json"]
  },
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: {
          loader: "babel-loader"
        }
      },
      {
        test: /\.css$/i,
        use: ["style-loader", "css-loader"]
      },
      {
        test: /\.(png|jpg|jpeg|gif|svg|woff2?|eot|ttf|otf)$/i,
        type: "asset",
        generator: {
          filename: "assets/[name][hash][ext][query]"
        }
      }
    ]
  },
  devServer: {
    static: {
      directory: path.resolve(__dirname, "public"),
      watch: true
    },
    client: {
      overlay: true
    },
    historyApiFallback: {
      rewrites: [
        { from: /^\/a(?:\/.*)?$/, to: "/index.html" },
        { from: /^\/p(?:\/.*)?$/, to: "/user.html" },
        { from: /^\/r(?:\/.*)?$/, to: "/user.html" }
      ]
    },
    hot: true,
    compress: true,
    port: 5173,
    open: {
      app: {
        name: "chrome"
      },
      target: ["index.html"]
    }
  }
  ,
  plugins: [
    new webpack.DefinePlugin({
      "process.env.API_BASE_URL": JSON.stringify(process.env.API_BASE_URL || ""),
      "process.env.BASE_URL": JSON.stringify(process.env.BASE_URL || ""),
      "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV || (isProduction ? "production" : "development")),
      "process.env.CORS_ALLOWED_ORIGINS": JSON.stringify(process.env.CORS_ALLOWED_ORIGINS || "")
    })
  ]
};
