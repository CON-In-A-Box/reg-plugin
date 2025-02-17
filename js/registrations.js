const CURRENT_EVENT = "248";
const TEST_EVENT = "142";

/**
 * Created by Colleen Baltutis on 6/10/18.
 */

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  console.log(
    sender.tab
      ? "Called from a content script:" + sender.tab.url
      : "Called from the extension with action: " + request.action
  );
  if (request.action == "Get Registrations Data")
    sendResponse({ data: getRegistrationsInfo() });
});

function getRegistrationsInfo() {
  console.log(
    "getRegistrationsInfo Received a request to load up the registration data"
  );
  var dataArray = [];

  var eventHref = $(".contentHeader").find("a").attr("href");
  var eventId = eventHref.substring(eventHref.indexOf("=") + 1);

  // Scrape the page for Attendee names and IDs
  // get array of elements with class "textSmall"
  var elementArray = $(".textSmall").each(function () {
    var attendeeHref = $(this).find("a").attr("href");
    var attendeeID = attendeeHref.substring(attendeeHref.indexOf("=") + 1);

    // get original element's parent's next sibling tr
    // get that tr's 2nd td child (1st with class 'viewField')
    // get td's child a, pull acct# from href, name from text
    var accountA = $(this)
      .parent()
      .next()
      .find("td.viewField")
      .first()
      .find("a");
    var accountHref = accountA.attr("href");
    var accountID = "";
    if (accountHref != null) {
      accountID = accountHref.substring(accountHref.indexOf("=") + 1);
    }
    var name = accountA.text().trim();
    dataArray.push(new registrant(accountID, attendeeID, name, eventId));
  });

  console.log(dataArray);
  return dataArray;
}

//Builds the data object
function registrant(accountId, attendeeId, name, eventId) {
  this.accountId = accountId;
  this.attendeeId = attendeeId;
  this.name = name;

  this.state = "green";
  this.reason = "OK to proceed";

  console.log("Registrant we are processing: " + this.name);

  //Checks for the correct event number and that the attendee data exists for the person
  //Change to current event ID. 142 is the CONvergence Example for Training Only event.
  if (eventId !== TEST_EVENT && eventId !== CURRENT_EVENT) {
    console.log("Wrong CONvergence year!");
    this.state = "red";
    this.reason =
      "This registration is not for this year or is for a Dealer/Artist.  If Dealer/Artist send to Help Desk, otherwise please click back and select the attendee's current Registration.";
  }

  if (this.accountId === "") {
    console.log("No Account ID Found!");
    this.state = "red";
    this.reason =
      "No account ID for this person. Please direct member to Help Desk for assistance!";
  }

  if (this.attendeeId === "") {
    console.log("No Attendee ID Found!");
    this.state = "red";
    this.reason =
      "No attendee ID for this person. Please direct member to Help Desk for assistance!";
  }

  if (this.name == "") {
    console.log("No name for this badge!");
    this.state = "red";
    this.reason =
      "No name associated with this badge. Please direct member to Help Desk for assistance!";
  }

  console.log("the reason is: " + this.reason);
}
