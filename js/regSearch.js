/**
 * Created by Matt Resong on 7/1/2014.
 */

/**
 * Created by mreso_000 on 1/10/14.
 */

// The background page is asking us to find the attendee information on this page.
// So we will call a function to do just that and are then done.
// TODO Handle more messages, such as a getAttendee and a pickedUp that updates the page as needed.
chrome.runtime.onMessage.addListener (
    function(request, sender, sendResponse) {
        console.log(sender.tab ?
            "Called from a content script:" + sender.tab.url :
            "Called from the extension with action: "+request.action);
        if (request.action =="Search Registrant Name")
            sendResponse(setRegistrantNameSearch());
    });


// Fill in the Registrant Name Search Field and click the search button

function setRegistrantNameSearch() {
    console.log("setRegistrantNameSearch Received a request to search");
    //var badgeNumber = getParameterByName("id");
    var badgeNumber = document.getElementById("attendee_id").text;
    var attendeeName = "".concat(document.getElementsByName('attendee.firstName')[0].value," ",document.getElementsByName('attendee.lastName')[0].value);
    var attendeeBadgeName = $("label:contains('Badge Name'):first").next().find("input").val();
    var numberActiveBadges = parseInt($("label:contains('Number of Active Badges'):first").next().find("input").val());
    var ticketType = document.getElementById('ticketPackageId').options[document.getElementById('ticketPackageId').selectedIndex].text;
}
