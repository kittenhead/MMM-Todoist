/* global Module */

/* Magic Mirror
 * Module: MMM-Todoist
 *
 * By Chris Brooker
 *
 * MIT Licensed.
 */

/*
 * Update by mabahj 24/11/2019
 * - Added support for labels in addtion to projects
 * Update by AgP42 the 18/07/2018
 * Modification added :
 * - Management of a PIR sensor with the module MMM-PIR-Sensor (by PaViRo). In case PIR module detect no user,
 * the update of the ToDoIst is stopped and will be requested again at the return of the user
 * - Management of the "module.hidden" by the core system : same behaviour as "User_Presence" by the PIR sensor
 * - Add "Loading..." display when the infos are not yet loaded from the server
 * - Possibility to add the last update time from server at the end of the module.
 * This can be configured using "displayLastUpdate" and "displayLastUpdateFormat"
 * - Possibility to display long task on several lines(using the code from default module "calendar".
 * This can be configured using "wrapEvents" and "maxTitleLength"
 *
 * // Update 27/07/2018 :
 * - Correction of start-up update bug
 * - correction of regression on commit #28 for tasks without dueDate
 * */

//UserPresence Management (PIR sensor)
var UserPresence = true; //true by default, so no impact for user without a PIR sensor

Module.register("MMM-Todoist", {

	defaults: {
		maximumEntries: 10,
		projects: [],
		blacklistProjects: false,
	    	labels: [""],
		updateInterval: 10 * 60 * 1000, // every 10 minutes,
		fade: true,
		fadePoint: 0.25,
		fadeMinimumOpacity: 0.25,
		sortType: "todoist",

		//New config from AgP42
		displayLastUpdate: false, //add or not a line after the tasks with the last server update time
		displayLastUpdateFormat: "dd - HH:mm:ss", //format to display the last update. See Moment.js documentation for all display possibilities
		maxTitleLength: 25, //10 to 50. Value to cut the line if wrapEvents: true
		wrapEvents: false, // wrap events to multiple lines breaking at maxTitleLength
		displayTasksWithoutDue: true, // Set to false to not print tasks without a due date
		displayTasksWithinDays: -1, // If >= 0, do not print tasks with a due date more than this number of days into the future (e.g., 0 prints today and overdue)
		// 2019-12-31 by thyed
		displaySubtasks: true, // set to false to exclude subtasks
		displayAvatar: false,
		showProject: true,
		// projectColors: ["#95ef63", "#ff8581", "#ffc471", "#f9ec75", "#a8c8e4", "#d2b8a3", "#e2a8e4", "#cccccc", "#fb886e",
		// 	"#ffcc00", "#74e8d3", "#3bd5fb", "#dc4fad", "#ac193d", "#d24726", "#82ba00", "#03b3b2", "#008299",
		// 	"#5db2ff", "#0072c6", "#000000", "#777777"
		// ], //These colors come from Todoist and their order matters if you want the colors to match your Todoist project colors.
		
		//TODOIST Change how they are doing Project Colors, so now I'm changing it.
		projectColors: {
			30:'#B8255F',
			31:'#DC4C3E',
			32:'#C77100',
			33:'#B29104',
			34:'#949C31',
			35:'#65A33A',
			36:'#369307',
			37:'#42A393',
			38:'#148FAD',
			39:'#319DC0',
			40:'#6988A4',
			41:'#4180FF',
			42:'#692EC2',
			43:'#CA3FEE',
			44:'#A4698C',
			45:'#E05095',
			46:'#C9766F',
			47:'#808080',
			48:'#999999',
			49:'#8F7A69'
		},

		//This has been designed to use the Todoist Sync API.
		apiVersion: "v2",
		apiBase: "https://api.todoist.com/rest/v2",
		todoistEndpoint: "tasks", // Was "projects"
		todoistResourceType: "items", // Simplified from old sync format
		debug: false
	},

	// Define required scripts.
	getStyles: function () {
		return ["MMM-Todoist.css"];
	},
	getTranslations: function () {
		return {
			en: "translations/en.json",
			de: "translations/de.json",
			nb: "translations/nb.json"
		};
	},

	start: function () {
		var self = this;
		Log.info("Starting module: " + this.name);

		this.updateIntervalID = 0; // Definition of the IntervalID to be able to stop and start it again
		this.ModuleToDoIstHidden = false; // by default it is considered displayed. Note : core function "this.hidden" has strange behaviour, so not used here

		//to display "Loading..." at start-up
		this.title = "Loading...";
		this.loaded = false;

		if (this.config.accessToken === "") {
			Log.error("MMM-Todoist: AccessToken not set!");
			return;
		}

		//Support legacy properties
		if (this.config.lists !== undefined) {
			if (this.config.lists.length > 0) {
				this.config.projects = this.config.lists;
			}
		}

		// keep track of user's projects list (used to build the "whitelist")
		this.userList = typeof this.config.projects !== "undefined" ?
			JSON.parse(JSON.stringify(this.config.projects)) : [];

		this.sendSocketNotification("FETCH_TODOIST", this.config);

		//add ID to the setInterval function to be able to stop it later on
		this.updateIntervalID = setInterval(function () {
			self.sendSocketNotification("FETCH_TODOIST", self.config);
		}, this.config.updateInterval);
	},

	suspend: function () { //called by core system when the module is not displayed anymore on the screen
		this.ModuleToDoIstHidden = true;
		//Log.log("Fct suspend - ModuleHidden = " + ModuleHidden);
		this.GestionUpdateIntervalToDoIst();
	},

	resume: function () { //called by core system when the module is displayed on the screen
		this.ModuleToDoIstHidden = false;
		//Log.log("Fct resume - ModuleHidden = " + ModuleHidden);
		this.GestionUpdateIntervalToDoIst();
	},

	notificationReceived: function (notification, payload) {
		if (notification === "USER_PRESENCE") { // notification sended by module MMM-PIR-Sensor. See its doc
			//Log.log("Fct notificationReceived USER_PRESENCE - payload = " + payload);
			UserPresence = payload;
			this.GestionUpdateIntervalToDoIst();
		}
	},

	GestionUpdateIntervalToDoIst: function () {
		if (UserPresence === true && this.ModuleToDoIstHidden === false) {
			var self = this;

			// update now
			this.sendSocketNotification("FETCH_TODOIST", this.config);

			//if no IntervalID defined, we set one again. This is to avoid several setInterval simultaneously
			if (this.updateIntervalID === 0) {

				this.updateIntervalID = setInterval(function () {
					self.sendSocketNotification("FETCH_TODOIST", self.config);
				}, this.config.updateInterval);
			}

		} else { //if (UserPresence = false OR ModuleHidden = true)
			Log.log("Personne regarde : on stop l'update " + this.name + " projet : " + this.config.projects);
			clearInterval(this.updateIntervalID); // stop the update interval of this module
			this.updateIntervalID = 0; //reset the flag to be able to start another one at resume
		}
	},

	// Code from MichMich from default module Calendar : to manage task displayed on several lines
	/**
	 * Shortens a string if it's longer than maxLength and add a ellipsis to the end
	 *
	 * @param {string} string Text string to shorten
	 * @param {number} maxLength The max length of the string
	 * @param {boolean} wrapEvents Wrap the text after the line has reached maxLength
	 * @returns {string} The shortened string
	 */
	shorten: function (string, maxLength, wrapEvents) {
		if (typeof string !== "string") {
			return "";
		}

		if (wrapEvents === true) {
			var temp = "";
			var currentLine = "";
			var words = string.split(" ");

			for (var i = 0; i < words.length; i++) {
				var word = words[i];
				if (currentLine.length + word.length < (typeof maxLength === "number" ? maxLength : 25) - 1) { // max - 1 to account for a space
					currentLine += (word + " ");
				} else {
					if (currentLine.length > 0) {
						temp += (currentLine + "<br>" + word + " ");
					} else {
						temp += (word + "<br>");
					}
					currentLine = "";
				}
			}

			return (temp + currentLine).trim();
		} else {
			if (maxLength && typeof maxLength === "number" && string.length > maxLength) {
				return string.trim().slice(0, maxLength) + "&hellip;";
			} else {
				return string.trim();
			}
		}
	},
	//end modif AgP

	// Override socket notification handler.
	// ******** Data sent from the Backend helper. This is the data from the Todoist API ************
	socketNotificationReceived: function(notification, payload) {
		if (notification === "TASKS") {
			console.log("Received tasks:", payload); // Debug log
			this.tasks = payload.items || payload; // Adjust for REST v2 structure
			this.updateDom();
		}
	},	

	filterTodoistData: function(tasks) {
		var self = this;
		var items = [];
	
		if (!tasks || !Array.isArray(tasks)) {
			console.error("Invalid tasks data:", tasks);
			return;
		}
	
		// Process each task
		tasks.forEach(function(item) {
			if (item.parent_id != null && !self.config.displaySubtasks) return;
	
			if (self.config.labels.length > 0 && item.labels.length > 0) {
				for (let label of item.labels) {
					for (let labelName of self.config.labels) {
						if (label === labelName) {
							items.push(item);
							return;
						}
					}
				}
			}
	
			if (self.config.projects.length > 0) {
				self.config.projects.forEach(function(project) {
					if (String(item.project_id) === String(project)) {
						items.push(item);
						return;
					}
				});
			}
		});
	
		// Sort by due date descending
		if (self.config.sortType === "dueDateDesc") {
			items.sort((a, b) => {
				const dateA = a.due?.date ? new Date(a.due.date) : new Date(0);
				const dateB = b.due?.date ? new Date(b.due.date) : new Date(0);
				return dateB - dateA;
			});
		}
	
		items = items.slice(0, this.config.maximumEntries);
	
		this.tasks = { items: items };
	},		
	/*
	 * The Todoist API returns task due dates as strings in these two formats: YYYY-MM-DD and YYYY-MM-DDThh:mm:ss
	 * This depends on whether a task only has a due day or a due day and time. You cannot pass this date string into
	 * "new Date()" - it is inconsistent. In one format, the date string is considered to be in UTC, the other in the
	 * local timezone. Additionally, if the task's due date has a timezone set, it is given in UTC (zulu format),
	 * otherwise it is local time. The parseDueDate function keeps Dates consistent by interpreting them all relative
	 * to the same timezone.
	 */
	parseDueDate: function(date) {
		if (!date) return null;
		
		// Handle both date-only and datetime formats
		const isoDate = date.endsWith("Z") ? date : date + "T00:00:00Z";
		const parsedDate = new Date(isoDate);
		
		return isNaN(parsedDate) ? null : parsedDate;
	},	
	sortByTodoist: function (itemstoSort) {
		itemstoSort.sort(function (a, b) {
			if (!a.parent_id && !b.parent_id) {
				// neither have parent_id so both are parent tasks, sort by their id
				return a.id - b.id;
			} else if (a.parent_id === b.parent_id) {
				// both are children of the same parent task, sort by child order
				return a.child_order - b.child_order;
			} else if (a.parent_id === b.id) {
				// a is a child of b, so it goes after b
				return 1;
			} else if (b.parent_id === a.id) {
				// b is a child of a, so it goes after a
				return -1;
			} else if (!a.parent_id) {
				// a is a parent task, b is a child (but not of a), so compare a to b's parent
				return a.id - b.parent_id;
			} else if (!b.parent_id) {
				// b is a parent task, a is a child (but not of b), so compare b to a's parent
				return a.parent_id - b.id;
			} else {
				// both are child tasks, but with different parents so sort by their parents
				return a.parent_id - b.parent_id;
			}
		});
		return itemstoSort;
	},
	sortByDueDateAsc: function (itemstoSort) {
		itemstoSort.sort(function (a, b) {
			return a.date - b.date;
		});
		return itemstoSort;
	},
	sortByDueDateDesc: function (itemstoSort) {
		itemstoSort.sort(function (a, b) {
			return b.date - a.date;
		});
		return itemstoSort;
	},
	sortByPriority: function (itemstoSort) {
		itemstoSort.sort(function (a, b) {
			return b.priority - a.priority;
		});
		return itemstoSort;
	},
	sortByDueDateDescPriority: function (itemstoSort) {
		itemstoSort.sort(function (a, b) {
			if (a.date > b.date) return 1;
			if (a.date < b.date) return -1;

			if (a.priority < b.priority) return 1;
			if (a.priority > b.priority) return -1;
		});
		return itemstoSort;
    	},
	createCell: function(className, innerHTML) {
		var cell = document.createElement("div");
		cell.className = "divTableCell " + className;
		cell.innerHTML = innerHTML;
		return cell;
	},
	addPriorityIndicatorCell: function(item) {
		var className = "priority ";
		switch (item.priority) {
			case 4:
				className += "priority1";
				break;
			case 3:
				className += "priority2";
				break;
			case 2:
				className += "priority3";
				break;
			default:
				className = "";
				break;
		}
		return this.createCell(className, "&nbsp;");;
	},
	addColumnSpacerCell: function() {
		return this.createCell("spacerCell", "&nbsp;");
	},
	addTodoTextCell: function(item) {
		var temp = document.createElement('div');
		temp.innerHTML = item.contentHtml;

		var para = temp.getElementsByTagName('p');
		var taskText = para[0].innerHTML;
		// if sorting by todoist, indent subtasks under their parents
		if (this.config.sortType === "todoist" && item.parent_id) {
			// this item is a subtask so indent it
			taskText = '- ' + taskText;
		}
		return this.createCell("title bright alignLeft", 
			this.shorten(taskText, this.config.maxTitleLength, this.config.wrapEvents));

		// return this.createCell("title bright alignLeft", item.content);
	},
	addDueDateCell: function (item) {
		var className = "bright align-right dueDate ";
		var innerHTML = "";
		var oneDay = 24 * 60 * 60 * 1000;
	
		// Parse the due date using the updated function
		var dueDateTime = this.parseDueDate(item.due?.date);
		if (!dueDateTime) {
			innerHTML = "No Due Date"; // Handle tasks without a due date
			className += "xsmall";
			return this.createCell(className, innerHTML);
		}
	
		var dueDate = new Date(dueDateTime.getFullYear(), dueDateTime.getMonth(), dueDateTime.getDate());
		var now = new Date();
		var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
		var diffDays = Math.floor((dueDate - today) / oneDay);
	
		if (diffDays < -1) {
			innerHTML = dueDate.toLocaleDateString(config.language, { month: "short" }) + " " + dueDate.getDate();
			className += "xsmall overdue";
		} else if (diffDays === -1) {
			innerHTML = this.translate("YESTERDAY");
			className += "xsmall overdue";
		} else if (diffDays === 0) {
			innerHTML = this.translate("TODAY");
			className += item.all_day || dueDateTime >= now ? "today" : "overdue";
		} else if (diffDays === 1) {
			innerHTML = this.translate("TOMORROW");
			className += "xsmall tomorrow";
		} else if (diffDays < 7) {
			innerHTML = dueDate.toLocaleDateString(config.language, { weekday: "short" });
			className += "xsmall";
		} else {
			innerHTML = dueDate.toLocaleDateString(config.language, { month: "short" }) + " " + dueDate.getDate();
			className += "xsmall";
		}
	
		return this.createCell(className, innerHTML);
	},
		
	addProjectCell: function(item) {
		var project = this.tasks.projects.find(p => p.id === item.project_id);
		var projectcolor = this.config.projectColors[project.color];
		var innerHTML = "<span class='projectcolor' style='color: " + projectcolor + "; background-color: " + projectcolor + "'></span>" + project.name;
		return this.createCell("xsmall", innerHTML);
	},
	addAssigneeAvatorCell: function(item, collaboratorsMap) {	
		var avatarImg = document.createElement("img");
		avatarImg.className = "todoAvatarImg";

		var colIndex = collaboratorsMap.get(item.responsible_uid);
		if (typeof colIndex !== "undefined" && this.tasks.collaborators[colIndex].image_id!=null) {
			avatarImg.src = "https://dcff1xvirvpfp.cloudfront.net/" + this.tasks.collaborators[colIndex].image_id + "_big.jpg";
		} else { avatarImg.src = "/modules/MMM-Todoist/1x1px.png"; }

		var cell = this.createCell("", "");
		cell.appendChild(avatarImg);

		return cell;
	},
	getDom: function() {
		var wrapper = document.createElement("div");
	
		if (!this.tasks || this.tasks.length === 0) {
			wrapper.innerHTML = "No tasks to display.";
			return wrapper;
		}
	
		var table = document.createElement("table");
		table.className = "todoTable";
	
		this.tasks.forEach((task) => {
			var row = document.createElement("tr");
			row.className = "todoRow";
	
			// Add priority indicator cell
			var priorityCell = this.addPriorityIndicatorCell(task);
			row.appendChild(priorityCell);
	
			// Add task text cell
			var textCell = this.addTodoTextCell(task);
			row.appendChild(textCell);
	
			// Add due date cell
			var dueDateCell = this.addDueDateCell(task);
			row.appendChild(dueDateCell);
	
			table.appendChild(row);
		});
	
		wrapper.appendChild(table);
		return wrapper;
	},
});
