/**
 * Copyright 2017 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

exports.sendNotifications = functions.firestore
  .document("messages/{messageId}")
  .onCreate(async snapshot => {
    const text = snapshot.data().text;
    const payload = {
      notification: {
        title: `${snapshot.data().name} posted ${
          text ? "a message" : "an image"
        }`,
        body: text
          ? text.length <= 100
            ? text
            : text.substring(0, 97) + "..."
          : "",
        icon:
          snapshot.data().profilePicUrl || "/images/profile_placeholder.png",
        click_action: `https://${process.env.GCLOUD_PROJECT}.firebaseapp.com`
      }
    };
    const allTokens = await admin
      .firestore()
      .collection("fcmTokens")
      .get();
    const tokens = [];
    allTokens.forEach(tokenDoc => {
      tokens.push(tokenDoc.id);
    });
    if (tokens.length > 0) {
      const response = await admin.messaging().sendToDevice(tokens, payload);
      await cleanupTokens(response, tokens);
      console.log("Notifications have been sent and tokens cleaned up");
    }
  });

function cleanupTokens(response, tokens) {
  const tokensDelete = [];
  response.results.forEach((result, index) => {
    const error = result.error;
    if (error) {
      console.error("Failure sending notification to", tokens[index], error);
      if (
        error.code === "messaging/invalid-registration-token" ||
        error.code === "messaging/registration-token-not-registered"
      ) {
        const deleteTask = admin
          .firestore()
          .collection("messages")
          .doc(tokens[index])
          .delete();
        tokensDelete.push(deleteTask);
      }
    }
  });
  return Promise.all(tokensDelete);
}
