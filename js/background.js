/**
 * Created by Matt Resong on 1/10/14.
 */

/****************************************************
 * VARIABLES
 */
// Global accessor that the popup uses.
var attendeeInfo = null;
var registrationsInfo = null;
//var attendeeData = {};


/****************************************************
 * PRINTING
 *
 * This section checks pages for appropriate data and
 * causes the connie wink to appear and disappear
 * in various colors depending upon the data received.
 *
 * It is intended to facilitate the printing function.
 */

// Listen for a tab to finish loading of the specific URL
// This works much better than adding a listener via chrome.tabs
// as it does not execute for every site and every tab
chrome.webNavigation.onCompleted.addListener(function checkForValidUrl2(tabId) {
    console.log("The appropriate page has finished loading, moving on");
    // setup the valid tab, get the data and display the icon
    updateAttendeeInfo(tabId.tabId);
}, {url: [{urlContains: 'ce.z2systems.com/np/admin/event/attendeeEdit.do'}] });

chrome.webNavigation.onCompleted.addListener(function checkForValidUrl2(tabId) {
    console.log("The appropriate page has finished loading, moving on");
    // setup the valid tab, get the data and display the icon
    updateAttendeeInfo(tabId.tabId);
}, {url: [{urlContains: 'trial.z2systems.com/np/admin/event/attendeeEdit.do'}] });

chrome.webNavigation.onCompleted.addListener(function checkForValidUrl2(tabId) {
    console.log("The appropriate page has finished loading, moving on");
    // setup the valid tab, get the data and display the icon
    updateAttendeeInfo(tabId.tabId);
}, {url: [{urlContains: 'ce.z2systems.com/np/admin/event/contactSelect.do'}] });

chrome.webNavigation.onCompleted.addListener(function checkForValidUrl2(tabId) {
    console.log("The appropriate page has finished loading, moving on");
    // setup the valid tab, get the data and display the icon
    updateAttendeeInfo(tabId.tabId);
}, {url: [{urlContains: 'trial.z2systems.com/np/admin/event/contactSelect.do'}] });

chrome.webNavigation.onCompleted.addListener(function checkForValidUrl2(tabId) {
    console.log("The appropriate page has finished loading, moving on");
    // setup the valid tab, get the data and display the icon
    updateRegistrationsInfo(tabId.tabId);
}, {url: [{urlContains: 'ce.z2systems.com/np/admin/event/eventRegDetails.do'}] });

chrome.webNavigation.onCompleted.addListener(function checkForValidUrl2(tabId) {
    console.log("The appropriate page has finished loading, moving on");
    // setup the valid tab, get the data and display the icon
    updateRegistrationsInfo(tabId.tabId);
}, {url: [{urlContains: 'trial.z2systems.com/np/admin/event/eventRegDetails.do'}] });

//This will update the information we have about the attendee and make the icon appear and disappear as needed
function updateAttendeeInfo(tabId){
    chrome.tabs.sendMessage(tabId, {action: "Get Attendee Data"}, function(attendee) {
        console.log("The attendee data returned was:"+attendee);
        attendeeInfo = attendee;
        if (!attendee) {
            console.log('This page does not have the required attendee data and therefore no icon will display');
            chrome.pageAction.hide(tabId);
        } else {
            //var ico = 'assets/wink-'+attendeeInfo[0].valueOf()+'-19.png';;
            var ico = 'assets/wink-'+attendeeInfo.state+'-19.png';
            console.log("The icon path to set is: "+ico);
            chrome.pageAction.setIcon({tabId: tabId, path:ico}, function() {
                chrome.pageAction.show(tabId);
            });
        }
    });
}

function updateRegistrationsInfo(tabId){
    chrome.tabs.sendMessage(tabId, {action: "Get Registrations Data"}, function(registrations) {
        console.log("The registrations data returned was:"+registrations);
        registrationsInfo = registrations;
        if (!registrations) {
            console.log('This page does not have the required registrations data and therefore no icon will display');
            chrome.pageAction.hide(tabId);
        } else {
            //var ico = 'assets/wink-'+attendeeInfo[0].valueOf()+'-19.png';;
            var color = 'green';
            /*registrations.forEach(function() {
              if (this.state = 'red'){
                color = 'red';
              }
            });*/
            var ico = 'assets/wink-'+color+'-19.png';
            console.log("The icon path to set is: "+ico);
            chrome.pageAction.setIcon({tabId: tabId, path:ico}, function() {
                chrome.pageAction.show(tabId);
            });
        }
    });
}


/****************************************************
 * INSTALLATION AND UPGRADES
 *
 * This displays a message when installing the app
 * or upgrading it and opens the chrome settings
 * to encourage the user to change the download
 * location for the printing portion of this extension.
 */

chrome.runtime.onInstalled.addListener(function (details){
    if (details.reason=="install" || details.reason=="upgrade") {
        chrome.tabs.create({url: "chrome://settings/"});
        window.alert(chrome.i18n.getMessage("appInstallMsg"));
    }

});


/****************************************************
 * OMNIBOX
 *
 * The below handles our omnibox keyword.
 *
 * It is reasonably intelligent and tries to guess
 * if the user entry is a badge number or not and
 * takes appropriate action based upon the input
 * and the users selection in the omnibox
 */

// This event is fired each time the user updates the text in the omnibox,
// as long as the extension's keyword mode is still active.
chrome.omnibox.onInputChanged.addListener(
    function(text, suggest) {
        //console.log('omnibox inputChanged: ' + text);
        var badgeNum;
        if (text.match(/^[a,A,k,K,c,C,t,T][1-9]+/)) {
            console.log("We think this is a badge identifier so far and we will place that suggestion at the top of the list");
            badgeNumId = text.substring(1);
            //console.log(badgeNumId);
            suggest([
                {content: "https://ce.z2systems.com/np/admin/event/attendeeEdit.do?id="+badgeNumId, description: "Navigate to this Badge Number"},
                {content: "https://ce.z2systems.com/np/admin/searchResult.do?key="+text+"&search=Search&searchType=1", description: "Search For This Account Keyword"},
                {content: "https://ce.z2systems.com/np/admin/event/registrationSearch.do?query.eventId=172", description: "Open a general search for registrants/attendees"}
            ]);
        } else {
            suggest([
                {content: "https://ce.z2systems.com/np/admin/searchResult.do?key="+text+"&search=Search&searchType=1", description: "Search For This Account Keyword"},
                {content: "https://ce.z2systems.com/np/admin/event/attendeeEdit.do?id="+text, description: "Navigate to this Badge Number"},
                {content: "https://ce.z2systems.com/np/admin/event/registrationSearch.do?query.eventId=172", description: "Open a general search for registrants/attendees"}
            ]);
        }
    });

// This event is fired with the user accepts the input in the omnibox.
chrome.omnibox.onInputEntered.addListener(
    function(text)
    {
        //console.log('omnibox inputEntered: ' + text);
        chrome.tabs.getSelected(null, function(tab)
        {
            var url;
            if (text.substr(0, 8) == 'https://') {
                console.log("User picked a URL option, so we will go with that. User entered: "+text);
                url = text;
                // If text does not look like a URL, then we will guess based on the input
            } else {
                if (text.match(/^[a,A,k,K,c,C,t,T][1-9]+/)) {
                    badgeNumId = text.substring(1);
                    console.log("We think this is a badge identifier so that's what we will look for. User entered: "+text+" we are seraching for: "+badgeNumId);
                    url = "https://ce.z2systems.com/np/admin/event/attendeeEdit.do?id="+badgeNumId;
                } else {
                    if (text.trim()=="") {
                        console.log("User did not enter anything, so we will take them to a generic search");
                        url = "https://ce.z2systems.com/np/admin/event/registrationSearch.do?query.eventId=172";
                    } else {
                        console.log("It doesn't look like a badge number so lets just search neon accounts. User entered: "+text);
                        url = "https://ce.z2systems.com/np/admin/searchResult.do?key="+text+"&search=Search&searchType=1";
                    }
                }
            }
            chrome.tabs.update(tab.id, {url: url});
        });
    }
);

//This will start a registrant search for us
function searchRegistrant(tabId, keyword){
    chrome.tabs.sendMessage(tabId, {action: "Search Registrant Name", keyword: keyword}, function() {
    });
}
