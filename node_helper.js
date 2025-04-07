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

	fetchTodos: function() {
		var self = this;
		var accessToken = self.config.accessToken;
	
		request({
			url: self.config.apiBase + "/tasks",
			method: "GET",
			headers: {
				"Authorization": "Bearer " + accessToken,
				"Content-Type": "application/json"
			}
		}, function(error, response, body) {
			if (error) {
				self.sendSocketNotification("FETCH_ERROR", { error: error });
				return console.error("ERROR - MMM-Todoist: " + error);
			}
	
			if (response.statusCode === 200) {
				var tasks = JSON.parse(body);
	
				// Sort tasks by due date descending
				tasks.sort((a, b) => {
					const dateA = a.due?.date ? new Date(a.due.date) : new Date(8640000000000000); // Future date
					const dateB = b.due?.date ? new Date(b.due.date) : new Date(8640000000000000);
				
					return self.config.sortType === "dueDateAsc" 
						? dateA - dateB 
						: dateB - dateA;
				});				
	
				tasks.forEach((item) => {
					item.contentHtml = markdown.makeHtml(item.content); // Convert content to HTML
				});
	
				self.sendSocketNotification("TASKS", tasks); // Send sorted tasks
			}
		});
	}	
});
