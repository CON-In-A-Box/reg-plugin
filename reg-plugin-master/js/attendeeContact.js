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

    // Old version of badge number with attendee ID
    var attendeeId = $("label:contains('Attendee ID')").siblings().text().trim();

    // New version of badge number with account ID
    //var accountId = document.getElementById('usHidden').value;
    var accountId = new URL(window.location.toString()).searchParams.get('acct');

    //var badgeNumber = "1234";     //For testing

    var attendeeName = "".concat(document.getElementsByName('attendee.firstName')[0].value," ",document.getElementsByName('attendee.lastName')[0].value);
    var attendeeBadgeName = $("label:contains('Badge Name'):first").next().find("input").val();

    if (attendeeBadgeName == "" || attendeeBadgeName == null) {
        attendeeBadgeName = attendeeName;
    }

    var numActBadgesFromElement = $("label:contains('Number of Active Badges'):first").next().find("input").val();
    var numberActiveBadges = numActBadgesFromElement === '' ? 0 : parseInt(numActBadgesFromElement);
    var ticketType = document.getElementById('ticketPackageId').options[document.getElementById('ticketPackageId').selectedIndex].text;
    var arrChecks = $("label:contains('Art Show Hold - Do Not Release'):first").next().find("input");
    var opsHoldCheck = $("label:contains('Operations Hold - Do Not Release'):first").next().find("input");
    var regHoldCheck = $("label:contains('Registration Hold - Do Not Release'):first").next().find("input");
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

    var regHold="No";
    for (i=0; regHoldCheck[i]; i++)
        {
            if(regHoldCheck[i].checked){
            //checkedValue = arrChecks[i].value;
                regHold="Yes";
            break;
        }
        }


    console.log("Is there an art show hold? "+artShowHold);
    console.log("Is there an operations department hold? "+opsHold);
    console.log("Is there a registration department hold? "+regHold);
    console.log("Ticket: "+ticketType);
    console.log("Attendee ID: "+attendeeId);
    console.log("Account ID: "+accountId);
    console.log("Name: "+attendeeName+" NonTransfer Name: "+nonTransferName);

    var dataObject=new attendee(accountId, attendeeId, attendeeName, ticketType, numberActiveBadges, attendeeBadgeName, regStatus, artShowHold, opsHold, regHold, nonTransferName );

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


/*
    Populate data into the non-transferrable badge name and badge pickup fields to note badge picked up.
    Works for duplicate badges as well (increments and fills in the proper data for the proper badge issuance)
    Increment the badge number and set the date/time stamp fields and the non-transferrable name field
    Return true or false (Depending upon success.
*/
function incrementBadge() {

    console.log("incrementBadge Received a request and is processing it now");

    var elNumberActiveBadges = $("label:contains('Number of Active Badges'):first").next().find("input");
    var numActive = elNumberActiveBadges.val() === '' ? 0 : parseInt(elNumberActiveBadges.val());

    var saveButton = document.getElementsByName('save')[0];

    //var elFirstName = $("label:contains('First Name'):first").next().find("input");
    var elFirstName = $("#acInput");
    var elLastName = $("label:contains('Last Name'):first").next().find("input");
    var nonTransferableName = elFirstName.val().concat(" ", elLastName.val());
    //console.log("FNAME:"+elFirstName.val());
    //console.log("LNAME:"+elLastName.val());

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


    // Increment the active number of badges
    if (numActive === 0) {
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

    //Populate the non-transferrable name field with the name of the person on the registration
    var nonTransferableNameField = $("label:contains('Non-Transferable First and Last Name'):first").next().find("input");
    nonTransferableNameField.val( nonTransferableName );

    saveButton.click();
}


//Builds the data object
function attendee(accountId, attendeeId, name, ticket, activeBadges, badgeName, regStatus, artShowHold, opsHold, regHold, nonTransferName)
{
    this.accountId=accountId;
    this.attendeeId=attendeeId;
    this.name=name;
    this.ticket=ticket;
    this.activeBadges=activeBadges;
    this.badgeName=badgeName;
    this.regStatus=regStatus;
    this.artShowHold=artShowHold;
    this.opsHold=opsHold;
    this.regHold=regHold;
    this.nonTransferName=nonTransferName;

    this.state = 'green';
    this.reason = 'OK to proceed';
    this.ticket = this.ticket.substr(0,this.ticket.indexOf(' '));

    console.log("Ticket we are processing: "+this.ticket);

// Neon has a ticket name for each ticket, this identifies the type of ticket and sets the status and message for the Connie Head and pop-up
    switch (this.ticket) {
        case "Day":
            this.state = 'yellow';
            this.reason = "DAY PASS \nID VERIFICATION OF AGE OVER 18 REQUIRED (DOB BEFORE THIS DAY IN 2006)\nMAKE SURE DAY PASS IS ISSUED";   //UPDATE YEAR
            this.ticketText ="ADULT";
            this.attendeeId = "A"+this.attendeeId;
            this.badgeImage = 'ADULT.tif';
            break;
        case "Adult":
            this.state = 'yellow';
            this.reason = "ADULT \nID VERIFICATION OF AGE OVER 18 REQUIRED (DOB BEFORE THIS DAY IN 2006)\nMAKE SURE WEEKEND BADGE IS ISSUED";   //UPDATE YEAR
            this.ticketText ="ADULT";
            this.attendeeId = "A"+this.attendeeId;
            this.badgeImage = 'ADULT.tif';
            break;
        case "Child":
            this.ticketText ="CHILD";
            this.attendeeId = "K"+this.attendeeId;
            this.badgeImage = 'KID.tif';
            break;
        case "Youth":
            this.ticketText ="YOUTH";
            this.attendeeId = "C"+this.attendeeId;
            this.badgeImage = 'CHILD.tif';
            break;
        case "Teen":
            this.ticketText ="TEEN";
            this.attendeeId = "T"+this.attendeeId;
            this.badgeImage = 'TEEN.tif';
            break;
        /* Currently do not have a ticket type for Guests of Honor/prior Guests of Honor
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
            this.reason = "ADULT \nID VERIFICATION OF AGE OVER 18 REQUIRED (DOB BEFORE THIS DAY IN 2004)";
            this.ticketText ="ADULT";
            this.attendeeId = "A"+this.attendeeId;
            this.badgeImage = 'ADULT.tif';
            break;
        /* Currently do not have a ticket type for Guests of Honor +1
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

    //Check to make sure the registration is in a "SUCCEEDED" state meaning that it is fully processed and paid
    if (this.regStatus != "SUCCEEDED") {
        console.log("This is not paid for yet!");
        this.state = 'red';
        this.reason = 'NOT PAID\nThis badge has not been paid for. Please direct member to cashier for assistance!';
    }

    //Check to see if this badge has already been picked up, replacement badges need to go through Help Desk/Cashier
    if (this.activeBadges != null && this.activeBadges>0) {
        console.log("There are already active badges");
        this.state = 'red';
        this.reason = 'PRINTED\nThis badge was already printed and cannot be printed again. Please direct member to cashier for assistance!';
    }

    //Check to see if the Art Show has identified this person as needing to see them before picking up their badge
    if (this.artShowHold == "Yes") {
        console.log("There is an art show hold");
        this.state = 'red';
        this.reason = 'HOLD\nSend member to Help Desk.\nHelp Desk instructions: This badge has an art show hold. Please direct member to art show to pay and then to help desk to log.';
    }

    //Check to see if the Operations has identified this person as needing to see them before picking up their badge
    if (this.opsHold == "Yes") {
            console.log("There is an operations department hold");
            this.state = 'red';
            this.reason = 'HOLD\nSend member to Help Desk.\nHelp Desk instructions: This badge has an operations department hold. Please direct the member to operations.';
        }

    //Check to see if the Registration has identified this person as needing to see the Help Desk before picking up their badge    
    if (this.regHold == "Yes") {
        console.log("There is a registration department hold");
        this.state = 'red';
        this.reason = 'HOLD\nSend member to Help Desk.\nHelp Desk instructions: This badge has an registration department hold. Please review notes on account or contact Head.';
    }
        
   /* 
    if (this.id < 65158) {    //Update each year to lowest numbered attendee to assist reduction of human error
        this.state = 'red';
        this.reason = 'THIS IS NOT AN ACTUAL CONVERGENCE REGISTRATION FOR THIS YEAR!\nCLICKED WRONG EVENT !!';

    }
    */

    //Some tickets (comps for example) are non-transferrable, if the names do not match they need to see the Help Desk
    if (this.nonTransferName !== "" && this.nonTransferName !== this.name) {
            this.state = 'red';
            this.reason = 'THIS IS A NON-TRANSFERABLE MEMBERSHIP!\nSEND MEMBER TO HELPDESK OR REQUEST ASSISTANCE !!';

        }

    //If the account ID is missing then something did not go correctly in scraping the data or the person clicked the Edit button instead of using the Connie Head    
    if (this.accountId === null) {
        console.log("No account number!");
        this.state = 'red';
        this.reason = 'NO ACCOUNT NUMBER\nClick "Cancel", then use the Connie head icon on the previous page.';
    }

    console.log("the reason is: "+this.reason);


}
