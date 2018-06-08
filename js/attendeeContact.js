/**
 * Created by Matt Resong on 1/10/14.
 */

// The background page is asking us to find the attendee information on this page.
// So we will call a function to do just that and are then done.
// TODO Handle more messages, such as a getAttendee and a pickedUp that updates the page as needed.


chrome.runtime.onMessage.addListener (
    function(request, sender, sendResponse) {
        console.log(sender.tab ?
            "Called from a content script:" + sender.tab.url :
            "Called from the extension with action: "+request.action);
        if (request.action =="Get Attendee Data")
            sendResponse(getAttendeeInfo());
        if (request.action =="Increment Badge Count")
            sendResponse(incrementBadge());
    });


// Search the page for attendee information
// Return null if nothing is found
function getAttendeeInfo() {
    console.log("getAttendeeInfo Received a request to load up the attendee data");
    //var badgeNumber = getParameterByName("id");      //This was the old way, before an extra window broke it
    var badgeNumber = $("label:contains('Attendee ID')").siblings().text().trim();
    //var badgeNumber = "1234";     //For testing

    var attendeeName = "".concat(document.getElementsByName('attendee.firstName')[0].value," ",document.getElementsByName('attendee.lastName')[0].value);
    var attendeeBadgeName = $("label:contains('Badge Name'):first").next().find("input").val();

    if (attendeeBadgeName == "" || attendeeBadgeName == null) {
        attendeeBadgeName = attendeeName;
    }

    var numActBadgesFromElement = $("label:contains('Number of Active Badges'):first").next().find("input").val();
    var numberActiveBadges = numActBadgesFromElement === "" ? 0 : parseInt($("label:contains('Number of Active Badges'):first").next().find("input").val());
    var ticketType = document.getElementById('ticketPackageId').options[document.getElementById('ticketPackageId').selectedIndex].text;
    var arrChecks = $("label:contains('Art Show Hold - Do Not Release'):first").next().find("input");
    var opsHoldCheck = $("label:contains('Operations Hold - Do Not Release'):first").next().find("input");
    var nonTransferName = $("label:contains('Non-Transferable First and Last Name'):first").next().find("input").val();
    /*
    if (window.jQuery) {
        console.log("jQuery Is Loaded");
        } else {
            // jQuery is not loaded
            console.log("jQuery Is NOT Loaded");
        }
     */
    var regStatus = $("label:contains('Registration Status')").siblings().text().trim();
    console.log(regStatus);

    //var regStatus = "SUCCEED";              //For Testing Only

    var artShowHold="No";
    for (i=0; arrChecks[i]; i++)
    {
        if(arrChecks[i].checked){
        //checkedValue = arrChecks[i].value;
            artShowHold="Yes";
        break;
    }
    }
    var opsHold="No";
    for (i=0; opsHoldCheck[i]; i++)
        {
            if(opsHoldCheck[i].checked){
            //checkedValue = arrChecks[i].value;
                opsHold="Yes";
            break;
        }
        }


    console.log("Is there an art show hold? "+artShowHold);
    console.log("Is there an operations department hold? "+opsHold);
    console.log("Ticket: "+ticketType);
    console.log("Badge Number: "+badgeNumber);
    console.log("Name: "+attendeeName+" NonTransfer Name: "+nonTransferName);

    var dataObject=new attendee(badgeNumber, attendeeName, ticketType, numberActiveBadges, attendeeBadgeName, regStatus, artShowHold, opsHold, nonTransferName );

    return dataObject;
}

//We need to get the attendees id number from the URL parameters as it appears to be the only place it is held at this time
//Therefore we will use this to strip back to only the parameter we need to get
function getParameterByName(name, callback)
{
    name = name.replace(/[\[]/, "\\\[").replace(/[\]]/, "\\\]");
    var regex = new RegExp("[\\?&]" + name + "=([^&#]*)"),
        results = regex.exec(location.search);

    return results == null ? "" : decodeURIComponent(results[1].replace(/\+/g, " "));
}


// Increment the badge number and set the date/time stamp fields
// Return true or false (Depending upon success.
function incrementBadge() {
    var numActiveBadgesFieldId = 8;
    var pickupDateFieldIds = [ 10, 12, 14, 16 ];
    var pickupTimeFieldIds = [ 11, 13, 15, 17 ];

    console.log("incrementBadge Received a request and is processing it now");


    //var checkFieldValue = $("label:contains('Number of Active Badges')").siblings('.div').children(".input").val();
    var checkFieldValue = $("label:contains('Number of Active Badges'):first").next().find("input").val();
    var numActive = parseInt(checkFieldValue);
    var elNumberActiveBadges = $("label:contains('Number of Active Badges'):first").next().find("input");
    var saveButton = document.getElementsByName('save')[0];

    var pickupDates = new Array();
    var elpickupDates = new Array();
    for( var i = 1; i < 5; i++ )
    {
      pickupDates.push($("label:contains('Pickup Date " + i + "'):first").next().find("input").val());
      elpickupDates.push($("label:contains('Pickup Date " + i + "'):first").next().find("input"));
    }

    var pickupTimes = new Array();
    var elpickupTimes = new Array();
    for( var i = 1; i < 5; i++ )
    {
        pickupTimes.push($("label:contains('Pickup Time " + i + "'):first").next().find("input").val());
        elpickupTimes.push($("label:contains('Pickup Time " + i + "'):first").next().find("input"));
    }

    var timestamp = new Date();
    console.log("The timestamp is set to the following time: "+timestamp.toLocaleTimeString());
    //console.log("The timestamp is set to the following date: "+timestamp.toLocaleDateString());
    var timestampformatteddate = ('0' + (timestamp.getMonth()+1)).slice(-2) + '/'
                               + ('0' + timestamp.getDate()).slice(-2) + '/'
                               + timestamp.getFullYear();
    console.log("The timestamp formatted date is: "+timestampformatteddate);


    // Increment the active number
    if (checkFieldValue=='') {
        elNumberActiveBadges.val( 1 );
    } else {
        elNumberActiveBadges.val( numActive + 1 );
    }

    //Set the date/time stamp
    for (var i = 0; i < pickupTimes.length; i ++) {
        if (pickupTimes[i]=='') {
            console.log("Time empty, assuming available slot at index: "+i);
            elpickupTimes[i].val(timestamp.toLocaleTimeString());
            elpickupDates[i].val(timestampformatteddate);
            //Its temporarily commented out to allow testing everything else
            break;
        } else {
            console.log("Moving on... Time NOT empty index: "+i+" value: "+pickupTimes[i]);
        }

    }
    saveButton.click();
}


//Builds the data object
function attendee(id,name, ticket, activeBadges, badgeName, regStatus, artShowHold, opsHold, nonTransferName)
{
    this.id=id;
    this.name=name;
    this.ticket=ticket;
    this.activeBadges=activeBadges;
    this.badgeName=badgeName;
    this.regStatus=regStatus;
    this.artShowHold=artShowHold;
    this.opsHold=opsHold;
    this.nonTransferName=nonTransferName;

    this.state = 'green';
    this.reason = 'OK to proceed';
    this.ticket = this.ticket.substr(0,this.ticket.indexOf(' '));

    this.workstation

    console.log("Ticket we are processing: "+this.ticket);

    switch (this.ticket) {
        case "Adult":
            this.state = 'yellow';
            this.reason = "ADULT \nID VERIFICATION OF AGE OVER 18 REQUIRED (DOB BEFORE THIS DAY IN 1998)";
            this.ticketText ="ADULT";
            this.badgeNumber = "A"+this.id;
            this.badgeImage = 'ADULT.tif';
            break;
        case "Young":
            this.ticketText ="KID";
            this.badgeNumber = "K"+this.id;
            this.badgeImage = 'KID.tif';
            break;
        case "Child":
            this.ticketText ="CHILD";
            this.badgeNumber = "C"+this.id;
            this.badgeImage = 'CHILD.tif';
            break;
        case "Teen":
            this.ticketText ="TEEN";
            this.badgeNumber = "T"+this.id;
            this.badgeImage = 'TEEN.tif';
            break;
        /*
        case "Prior GOH":
            this.state = 'yellow';
            this.reason ="ADULT \nID VERIFICATION OF AGE OVER 18 REQUIRED (DOB BEFORE JULY 4 1995)";
            this.ticketText ="ADULT";
            this.badgeNumber = "A"+this.id;
            this.badgeImage = 'ADULT.tif';
            break;
        case "GOH":
            this.ticketText ="KID";
            this.badgeNumber = "K"+this.id;
            this.badgeImage = 'KID.tif';
            break;
            */
        case "Invited Participant":
            this.state = 'yellow';
            this.reason = "ADULT \nID VERIFICATION OF AGE OVER 18 REQUIRED (DOB BEFORE THIS DAY IN 1998)";
            this.ticketText ="ADULT";
            this.badgeNumber = "A"+this.id;
            this.badgeImage = 'ADULT.tif';
            break;
        /*
        case "GOH +1 (guest of guest)":
            this.ticketText ="TEEN";
            this.badgeNumber = "T"+this.id;
            this.badgeImage = 'TEEN.tif';
            break;
            */
        default:
            this.state = 'red';
            this.reason = "UNKNOWN \nPLEASE REVIEW AND SEE A SUB OR CO HEAD FOR ASSISTANCE!";
            this.badgeNumber = "ERROR";
            this.badgeImage = 'NONE.tif';
    }

    if (this.regStatus != "SUCCEED") {
        console.log("This is not paid for yet!");
        this.state = 'red';
        this.reason = 'NOT PAID\nThis badge has not been paid for. Please direct member to cashier for assistance!';
    }

    if (this.activeBadges != null && this.activeBadges>0) {
        console.log("There are already active badges");
        this.state = 'red';
        this.reason = 'PRINTED\nThis badge was already printed and cannot be printed again. Please direct member to cashier for assistance!';
    }

    if (this.artShowHold == "Yes") {
        console.log("There is an art show hold");
        this.state = 'red';
        this.reason = 'HOLD\nThis badge has an art show hold. Please direct member to art show to pay and then to help desk to log.';
    }

    if (this.opsHold == "Yes") {
            console.log("There is an operations department hold");
            this.state = 'red';
            this.reason = 'HOLD\nThis badge has an operations department hold. Please direct the member to operations.';
        }

    if (this.id < 42214) {    //Update each year to lowest numbered attendee to assist reduction of human error
        this.state = 'red';
        this.reason = 'THIS IS NOT AN ACTUAL CONVERGENCE REGISTRATION FOR THIS YEAR!\nCLICKED WRONG EVENT !!';

    }

    if (this.nonTransferName !== "" && this.nonTransferName !== this.name) {
            this.state = 'red';
            this.reason = 'THIS IS A NON-TRANSFERABLE MEMBERSHIP!\nSEND MEMBER TO HELPDESK OR REQUEST ASSISTANCE !!';

        }

    console.log("the reason is: "+this.reason);


}
