/**
 *
 * @param {HTMLInputElement[]} checkBoxElements an array of checkbox elements that may or may not be checked.
 * @returns {boolean} true if any of the checkboxes are checked, false otherwise.
 */
function checkForHolds(checkBoxElements) {
  for (let i = 0; i < checkBoxElements.length; i++) {
    if (checkBoxElements[i].checked) {
      return true;
    }
  }
  return false;
}

/**
 * This function takes a day name and returns the corresponding number value repsenting the day of the week.
 * @param {string} dayName the name of the day (e.g., 'Thursday', 'Friday', etc.)
 * @returns {number} the number value of the day of the week (0-6) or -1 if the day name is invalid.
 */
function getDayValueForDayName(dayName) {
  switch (dayName) {
    case "Thursday":
      return 4;
    case "Friday":
      return 5;
    case "Saturday":
      return 6;
    case "Sunday":
      return 0;
    default:
      return -1;
  }
}

/**
 *
 * @returns {string} the date that is 18 years before today in MM/DD/YYYY format
 */
function calculateAdultAfterDate() {
  const todayDate = new Date();
  const adultYearsAgo = todayDate.getFullYear() - 18;
  const adultDate = new Date(
    adultYearsAgo,
    todayDate.getMonth(),
    todayDate.getDate()
  );

  return adultDate.toLocaleDateString();
}

/**
 *
 * @param {string} ticketType the name of a ticket, which will include whether it is for an adult, teen, youth, or child.
 * @returns {{ ticketName: string, badgeImage: string, badgeNumberPrefix: string }} an object with ticket information for a given ticket type
 */
function extractTicketDetailsForType(ticketType) {
  if (ticketType.includes("Adult")) {
    return {
      ticketName: "Adult",
      badgeImage: "ADULT.tif",
      badgeNumberPrefix: "A",
    };
  } else if (ticketType.includes("Teen")) {
    return {
      ticketName: "Teen",
      badgeImage: "TEEN.tif",
      badgeNumberPrefix: "T",
    };
  } else if (ticketType.includes("Youth")) {
    return {
      ticketName: "Youth",
      badgeImage: "CHILD.tif",
      badgeNumberPrefix: "C",
    };
  } else if (ticketType.includes("Child")) {
    return {
      ticketName: "Child",
      badgeImage: "KID.tif",
      badgeNumberPrefix: "K",
    };
  }

  // Default case
  return {
    ticketName: "Unknown",
    badgeImage: "NONE.tif",
    badgeNumberPrefix: "U",
  };
}

/**
 *
 * @param {string} ticketType the name of the ticket type, which will include whether it is for an adult, teen, youth, or child.
 * @param {string} ticketName the current ticket name, such as "Adult", "Teen", "Youth", or "Child"
 * @returns {string} the ticket name to use for this ticket.
 */
function extractTicketTextForTicketType(ticketType, ticketName) {
  const isDayPass = ticketType.includes("Day Pass");

  // Day pass is for a specific day
  if (isDayPass) {
    const isComplimentaryDayPass = ticketType.includes("Comp");
    return isComplimentaryDayPass
      ? "Comp Day Pass"
      : `${ticketName.toUpperCase()} Day Pass`;
  }

  return 'Weekend';
}

/**
 *
 * @param {string} ticketType the name of the ticket type, which will include whether it is for an adult, teen, youth, or child.
 * @param {string} adultDobDate the date of birth threshold for adults
 * @returns {{ status: string; reason: string; }} the ticket name to use for this ticket.
 */
function extractTicketStatus(ticketType, adultDobDate) {
  const isDayPass = ticketType.includes("Day Pass");
  const isComplimentaryDayPass = ticketType.includes("Comp");

  const isAdultTicket = ticketType.includes("Adult");

  if (isDayPass) {
    const dayPassReason = isAdultTicket
      ? `DAY PASS\nAGE VERIFICATION: MUST BE 18 OR OLDER (DOB BEFORE ${adultDobDate})\nMAKE SURE DAY PASS IS ISSUED`
      : "MAKE SURE DAY PASS IS ISSUED";
    if (isComplimentaryDayPass) {
      return {
        status: "yellow",
        reason: dayPassReason,
      };
    } else {
      const todayDay = new Date();
      const dayName = ticketType.match(/Thursday|Friday|Saturday|Sunday/)[0];
      const isDayPassDayCorrect =
        todayDay.getDay() === getDayValueForDayName(dayName);
      return {
        status: isDayPassDayCorrect ? "yellow" : "red",
        reason: isDayPassDayCorrect
          ? dayPassReason
          : "INCORRECT DAY\nDay Pass purchased for a different day than today. Please send attendee to Help Desk.",
      };
    }
  } else if (isAdultTicket) {
    return {
      status: "yellow",
      reason: `ADULT\nAGE VERIFICATION: MUST BE 18 OR OLDER (DOB BEFORE ${adultDobDate})`,
    };
  }

  if (
    ticketType.includes("Teen") ||
    ticketType.includes("Youth") ||
    ticketType.includes("Child")
  ) {
    return {
      status: "green",
      reason: "OK to proceed",
    };
  }

  return {
    status: "red",
    reason: "UNKNOWN \nPLEASE REVIEW AND SEE A SUB OR CO HEAD FOR ASSISTANCE!",
  };
}

/**
 * Created by Matt Resong on 1/10/14.
 */

// The background page is asking us to find the attendee information on this page.
// So we will call a function to do just that and are then done.
// TODO Handle more messages, such as a getAttendee and a pickedUp that updates the page as needed.

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  console.log(
    sender.tab
      ? "Called from a content script:" + sender.tab.url
      : "Called from the extension with action: " + request.action
  );
  if (request.action == "Get Attendee Data") sendResponse(getAttendeeInfo());
  if (request.action == "Increment Badge Count") sendResponse(incrementBadge());
});


/**
 * 
 * @returns {attendee}
 */
function getAttendeeInfo() {
  console.log(
    "getAttendeeInfo Received a request to load up the attendee data"
  );

  const attendeeId = $("label:contains('Attendee ID')")
    .siblings()
    .text()
    .trim();

  // New version of badge number with account ID
  const accountId = new URL(window.location.toString()).searchParams.get(
    "acct"
  );

  let attendeeName = "".concat(
    document.getElementsByName("attendee.firstName")[0].value,
    " ",
    document.getElementsByName("attendee.lastName")[0].value
  );
  let attendeeBadgeName = $("label:contains('Badge Name'):first")
    .next()
    .find("input")
    .val();

  if (attendeeBadgeName == "" || attendeeBadgeName == null) {
    attendeeBadgeName = attendeeName;
  }

  const numActBadgesFromElement = $(
    "label:contains('Number of Active Badges'):first"
  )
    .next()
    .find("input")
    .val();
  const numberActiveBadges =
    numActBadgesFromElement === "" ? 0 : parseInt(numActBadgesFromElement);
  const ticketType =
    document.getElementById("ticketPackageId").options[
      document.getElementById("ticketPackageId").selectedIndex
    ].text;
  const arrChecks = $("label:contains('Art Show Hold - Do Not Release'):first")
    .next()
    .find("input");
  const opsHoldCheck = $(
    "label:contains('Operations Hold - Do Not Release'):first"
  )
    .next()
    .find("input");
  const regHoldCheck = $(
    "label:contains('Registration Hold - Do Not Release'):first"
  )
    .next()
    .find("input");
  const nonTransferName = $(
    "label:contains('Non-Transferable First and Last Name'):first"
  )
    .next()
    .find("input")
    .val();

  const regStatus = $("label:contains('Registration Status')")
    .siblings()
    .text()
    .trim();
  console.log(regStatus);

  const artShowHold = checkForHolds(arrChecks);
  const opsHold = checkForHolds(opsHoldCheck);
  const regHold = checkForHolds(regHoldCheck);

  console.log("Is there an art show hold? " + artShowHold);
  console.log("Is there an operations department hold? " + opsHold);
  console.log("Is there a registration department hold? " + regHold);
  console.log("Ticket: " + ticketType);
  console.log("Attendee ID: " + attendeeId);
  console.log("Account ID: " + accountId);
  console.log(
    "Name: " + attendeeName + " NonTransfer Name: " + nonTransferName
  );

  var dataObject = new attendee(
    accountId,
    attendeeId,
    attendeeName,
    ticketType,
    numberActiveBadges,
    attendeeBadgeName,
    regStatus,
    artShowHold,
    opsHold,
    regHold,
    nonTransferName
  );

  return dataObject;
}

/*
    Populate data into the non-transferrable badge name and badge pickup fields to note badge picked up.
    Works for duplicate badges as well (increments and fills in the proper data for the proper badge issuance)
    Increment the badge number and set the date/time stamp fields and the non-transferrable name field
    Return true or false (Depending upon success.
*/
function incrementBadge() {
  console.log("incrementBadge Received a request and is processing it now");

  var elNumberActiveBadges = $(
    "label:contains('Number of Active Badges'):first"
  )
    .next()
    .find("input");
  var numActive =
    elNumberActiveBadges.val() === ""
      ? 0
      : parseInt(elNumberActiveBadges.val());

  var saveButton = document.getElementsByName("save")[0];

  //var elFirstName = $("label:contains('First Name'):first").next().find("input");
  var elFirstName = $("#acInput");
  var elLastName = $("label:contains('Last Name'):first").next().find("input");
  var nonTransferableName = elFirstName.val().concat(" ", elLastName.val());
  //console.log("FNAME:"+elFirstName.val());
  //console.log("LNAME:"+elLastName.val());

  var pickupDates = new Array();
  var elpickupDates = new Array();
  for (var i = 1; i < 5; i++) {
    pickupDates.push(
      $("label:contains('Pickup Date " + i + "'):first")
        .next()
        .find("input")
        .val()
    );
    elpickupDates.push(
      $("label:contains('Pickup Date " + i + "'):first")
        .next()
        .find("input")
    );
  }

  var pickupTimes = new Array();
  var elpickupTimes = new Array();
  for (var i = 1; i < 5; i++) {
    pickupTimes.push(
      $("label:contains('Pickup Time " + i + "'):first")
        .next()
        .find("input")
        .val()
    );
    elpickupTimes.push(
      $("label:contains('Pickup Time " + i + "'):first")
        .next()
        .find("input")
    );
  }

  var timestamp = new Date();
  console.log(
    "The timestamp is set to the following time: " +
      timestamp.toLocaleTimeString()
  );
  //console.log("The timestamp is set to the following date: "+timestamp.toLocaleDateString());
  var timestampformatteddate =
    ("0" + (timestamp.getMonth() + 1)).slice(-2) +
    "/" +
    ("0" + timestamp.getDate()).slice(-2) +
    "/" +
    timestamp.getFullYear();
  console.log("The timestamp formatted date is: " + timestampformatteddate);

  // Increment the active number of badges
  if (numActive === 0) {
    elNumberActiveBadges.val(1);
  } else {
    elNumberActiveBadges.val(numActive + 1);
  }

  //Set the date/time stamp
  for (var i = 0; i < pickupTimes.length; i++) {
    if (pickupTimes[i] == "") {
      console.log("Time empty, assuming available slot at index: " + i);
      elpickupTimes[i].val(timestamp.toLocaleTimeString());
      elpickupDates[i].val(timestampformatteddate);
      //Its temporarily commented out to allow testing everything else
      break;
    } else {
      console.log(
        "Moving on... Time NOT empty index: " + i + " value: " + pickupTimes[i]
      );
    }
  }

  //Populate the non-transferrable name field with the name of the person on the registration
  var nonTransferableNameField = $(
    "label:contains('Non-Transferable First and Last Name'):first"
  )
    .next()
    .find("input");
  nonTransferableNameField.val(nonTransferableName);

  saveButton.click();
}

//Builds the data object
function attendee(
  accountId,
  attendeeId,
  name,
  ticket,
  activeBadges,
  badgeName,
  regStatus,
  artShowHold,
  opsHold,
  regHold,
  nonTransferName
) {
  this.accountId = accountId;
  this.attendeeId = attendeeId;
  this.name = name;
  this.ticket = ticket;
  this.activeBadges = activeBadges;
  this.badgeName = badgeName;
  this.regStatus = regStatus;
  this.artShowHold = artShowHold;
  this.opsHold = opsHold;
  this.regHold = regHold;
  this.nonTransferName = nonTransferName;

  console.log("Ticket we are processing: " + ticket);

  const { ticketName, badgeImage, badgeNumberPrefix } = extractTicketDetailsForType(ticket);
  const ticketText = extractTicketTextForTicketType(
    ticket,
    ticketName
  );

  const adultDob = calculateAdultAfterDate();
  const { status, reason } = extractTicketStatus(ticket, adultDob);

  this.ticket = `${ticketName} ${ticketText}`;
  this.badgeImage = badgeImage;
  this.attendeeId = `${badgeNumberPrefix}${this.attendeeId}`;

  this.state = status;
  this.reason = reason;

  //Check to make sure the registration is in a "SUCCEEDED" state meaning that it is fully processed and paid
  if (this.regStatus != "SUCCEEDED") {
    console.log("This is not paid for yet!");
    this.state = "red";
    this.reason =
      "NOT PAID\nThis badge has not been paid for. Please direct attendee to cashier for assistance!";
  }

  //Check to see if this badge has already been picked up, replacement badges need to go through Help Desk/Cashier
  if (this.activeBadges != null && this.activeBadges > 0) {
    console.log("There are already active badges");
    this.state = "red";
    this.reason =
      "ISSUED\nThis badge was already issued. Please direct attendee to cashier for assistance!";
  }

  //Check to see if the Art Show has identified this person as needing to see them before picking up their badge
  if (this.artShowHold) {
    console.log("There is an art show hold");
    this.state = "red";
    this.reason =
      "HOLD\nSend attendee to Help Desk.\nHelp Desk instructions: This badge has an Art Show hold. Please direct attendee to Art Show to pay and then to the Registration Help Desk.";
  }

  //Check to see if the Operations has identified this person as needing to see them before picking up their badge
  if (this.opsHold) {
    console.log("There is an operations department hold");
    this.state = "red";
    this.reason =
      "HOLD\nSend attendee to Help Desk.\nHelp Desk instructions: This badge has an Operations department hold. Please direct the attendee to Operations.";
  }

  //Check to see if the Registration has identified this person as needing to see the Help Desk before picking up their badge
  if (this.regHold) {
    console.log("There is a registration department hold");
    this.state = "red";
    this.reason =
      "HOLD\nSend attendee to Help Desk.\nHelp Desk instructions: This badge has an Registration department hold. Please review notes on account or contact Head.";
  }

  //Some tickets (comps for example) are non-transferrable, if the names do not match they need to see the Help Desk
  if (this.nonTransferName !== "" && this.nonTransferName !== this.name) {
    this.state = "red";
    this.reason =
      "THIS IS A NON-TRANSFERABLE BADGE!\nSEND ATTENDEE TO THE HELP DESK !!";
  }

  //If the account ID is missing then something did not go correctly in scraping the data or the person clicked the Edit button instead of using the Connie Head
  if (this.accountId === null) {
    console.log("No account number!");
    this.state = "red";
    this.reason =
      'NO ACCOUNT NUMBER\nClick "Cancel", then use the Connie head icon on the previous page.';
  }

  console.log("the reason is: " + this.reason);
}
