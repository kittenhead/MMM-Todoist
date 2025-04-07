"use strict";

/* Magic Mirror
 * Module: MMM-Todoist
 *
 * By Chris Brooker
 *
 * MIT Licensed.
 */

const NodeHelper = require("node_helper");
const request = require("request");
const showdown = require("showdown");

const markdown = new showdown.Converter();

module.exports = NodeHelper.create({
	start: function() {
		console.log("Starting node helper for: " + this.name);
	},

	socketNotificationReceived: function(notification, payload) {
		if (notification === "FETCH_TODOIST") {
			this.config = payload;
			this.fetchTodos();
		}
	},

	fetchTodos : function() {
		var self = this;
		//request.debug = true;
		var accessToken = self.config.accessToken;

		// Change request format (old Sync API -> REST v2):
		request({
			url: self.config.apiBase + "/tasks", // Updated endpoint
			method: "GET", // Changed from POST to GET
			headers: {
				"Authorization": "Bearer " + accessToken,
				"Content-Type": "application/json"
			},
		// Remove old 'form' parameters
		},
		function(error, response, body) {
			if (error) {
				self.sendSocketNotification("FETCH_ERROR", {
					error: error
				});
				return console.error(" ERROR - MMM-Todoist: " + error);
			}
			if(self.config.debug){
				console.log(body);
			}
			if (response.statusCode === 200) {
				var tasks = JSON.parse(body);
			
				tasks.forEach((item) => {
					item.contentHtml = markdown.makeHtml(item.content); // Convert content to HTML
				});
			
				self.sendSocketNotification("TASKS", tasks); // Send tasks directly as an array
			}									
		});
	}
});
