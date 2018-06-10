/**
 * Created by Matt Resong on 1/10/14.
 */

// This script is used in the popup HTML that appears when you click the extension popup in the omni-box as appropriate

//When the window loads create the page data to display
window.onload = displayAttendeeInfo;
function displayAttendeeInfo() {
    chrome.tabs.getSelected(null, function(tab) {
        var attendeeData = chrome.extension.getBackgroundPage().attendeeInfo;
        var registrationsData = chrome.extension.getBackgroundPage().registrationsInfo;
        console.log("Popup attempted to receive data and it received: "+attendeeData);
        if (attendeeData && tab.url.includes('attendeeEdit'))
            buildAttendeeDataPage(attendeeData);
        else if (registrationsData && tab.url.includes('eventRegDetails'))
            buildRegistrationsDataPage(registrationsData);
        else
            buildNotFoundDataPage();
    });
}


// This builds the page body when attendee info is involved
// and calls whatever is needed to facilitate this
function buildAttendeeDataPage(attendeeData) {
    console.log("Building table with attendee data");
    //Build a table
    var body=document.getElementsByTagName('body')[0];
    var tbl=document.createElement('table');
    tbl.style.width='100%';
    tbl.setAttribute('border','1');
    var tbdy=document.createElement('tbody');
    var tr=document.createElement('tr');
    var td=document.createElement('td');
    td.appendChild(document.createTextNode(attendeeData.reason))
    //add the cell
    tr.appendChild(td)
    //add the row
    tbdy.appendChild(tr);

    tr=document.createElement('tr');
    td=document.createElement('td');
    td.appendChild(document.createTextNode("ID Name to Match: " + attendeeData.name))
    //add the cell
    tr.appendChild(td)
    //add the row
    tbdy.appendChild(tr);


    tbl.appendChild(tbdy);
    body.appendChild(tbl);
    // The table has finished being built

    var mngtOverride = "";

            chrome.storage.local.get( "mngtoverride", function ( items )
                                            {
                                                mngtOverride = items.managementOverride;







                                                if (attendeeData.state!="Red" || mngtOverride.checked) {

                                                    var elname = "badgebutton1";
                                                    var element = document.createElement("input");
                                                    element.setAttribute("type", "button");
                                                    element.setAttribute("value", chrome.i18n.getMessage("badgePickupButton"));
                                                    element.setAttribute("name", elname);
                                                    element.setAttribute("id", elname);
                                                    element.setAttribute("class", "button");
                                                    body.appendChild(element);

                                                    var el = document.getElementsByName(elname)[0];

                                                        if (el.addEventListener)
                                                            el.addEventListener("click", function() {
                                                                doBadgePrintDownload(attendeeData);
                                                            }, false );
                                                        else if (el.attachEvent)
                                                            el.attachEvent('onclick', function() {
                                                                doBadgePrintDownload(attendeeData);
                                                            });

                                                    }







                                            } );

    console.log("Management Override is: "+mngtOverride.checked);


    //Add a button to download a file to print the badge
    //This should really be seperate, but oh well


    /** if (attendeeData.state!="Red" || mngtOverride.checked) {

    var elname = "badgebutton1";
    var element = document.createElement("input");
    element.setAttribute("type", "button");
    element.setAttribute("value", chrome.i18n.getMessage("badgePickupButton"));
    element.setAttribute("name", elname);
    element.setAttribute("id", elname);
    element.setAttribute("class", "button");
    body.appendChild(element);

    }   **/





}

function buildRegistrationsDataPage(registrationData) {
    console.log("Building table with registrations data");
    //Build a table
    var body=document.getElementsByTagName('body')[0];
    var tbl=document.createElement('table');
    tbl.style.width='100%';
    tbl.setAttribute('border','1');
    var tbdy=document.createElement('tbody');
    var tr=document.createElement('tr');
    var td=document.createElement('td');
    td.appendChild(document.createTextNode('Select the Attendee'));
    tr.appendChild(td);
    //add the row
    tbdy.appendChild(tr);

    registrationData.data.forEach( function(reg)
    {
      var r = document.createElement('tr');
      var d = document.createElement('td');
      d.appendChild(document.createTextNode(reg.name));
      r.appendChild(d);

      var elname = "printButton";
      var element = document.createElement("input");
      element.setAttribute("type", "button");
      element.setAttribute("value", chrome.i18n.getMessage("editAttendeeButton"));
      element.setAttribute("class", "button");
      element.onclick = function () {
        chrome.tabs.getSelected(null, function(tab) {
            if (tab.url.includes('trial.z2stems.com'))
            {
              chrome.tabs.update({
                   url: "https://trial.z2systems.com/np/admin/event/attendeeEdit.do?id=" + reg.attendeeId + "&acct=" + reg.accountId
              });
            }
            else if (tab.url.includes('www.z2systems.com'))
            {
              chrome.tabs.update({
                   url: "https://www.z2systems.com/np/admin/event/attendeeEdit.do?id=" + reg.attendeeId + "&acct=" + reg.accountId
              });
            }
            window.close();
        });
      };
      body.appendChild(element);

      var d2 = document.createElement('td');
      d2.appendChild(element);
      r.appendChild(d2);
      tbdy.appendChild(r);
    });

    tbl.appendChild(tbdy);

    body.appendChild(tbl);
}

// This builds the page body when NO attendee info is involved
// and calls whatever is needed to facilitate this
// TODO make this into something better than a blank page
function buildNotFoundDataPage() {
    console.log("Building table missing attendee");
    var body=document.getElementsByTagName('body')[0];
    var tbl=document.createElement('table');
    tbl.style.width='100%';
    tbl.setAttribute('border','1');
    var tbdy=document.createElement('tbody');
    for(var i=0;i<3;i++){
        var tr=document.createElement('tr');
        for(var j=0;j<2;j++){
            if(i==2 && j==1){
                break
            } else {
                var td=document.createElement('td');
                td.appendChild(document.createTextNode('\u0020'))
                i==1&&j==1?td.setAttribute('rowSpan','2'):null;
                tr.appendChild(td)
            }
        }
        tbdy.appendChild(tr);
    }
    tbl.appendChild(tbdy);
    body.appendChild(tbl)

}

// This is what happens when the button is clicked

function doBadgePrintDownload(attendeeData) {

    saveTextAsFile(attendeeData.accountId, attendeeData.attendeeId, attendeeData.badgeName, attendeeData.badgeImage, attendeeData.ticket, attendeeData.activeBadges );

    //This will update the information we have about the attendee and save the form for us.
    //Saving the form automatically makes our Connie wink disappear, which makes us done!
    chrome.tabs.query({"status":"complete","windowId":chrome.windows.WINDOW_ID_CURRENT,"active":true}, function(tabs){
        //console.log(JSON.stringify(tabs[0]));
        //console.log(tabs[0].id);
        chrome.tabs.sendMessage(tabs[0].id, {action: "Increment Badge Count"}, function() {
            console.log("Should have saved now");
            window.close();
            // Window close seems to work more consistently here
        } );
    });
    //window.confirm("Printing Completed");
    //window.close();
}

function saveTextAsFile(accountId, attendeeId, badgeNameText, background, tix, printNumber)
{
    // This is from
    // http://thiscouldbebetter.wordpress.com/2012/12/18/loading-editing-and-saving-a-text-file-in-html5-using-javascrip/

    //var textToWrite = "THIS IS SAMPLE TEXT TO WRITE TO A FILE";
    //var textFileAsBlob = new Blob([textToWrite], {type:'text/plain'});
    var textHeader = '"Badge Type","Badge File BackGround","Account ID","Attendee ID","Badge Name","Workstation ID","Print Number"';
    var text = new Array();
    text[0] = tix;
    text[1] = background;
    text[2] = accountId;
    text[3] = attendeeId;
    text[4] = badgeNameText;

    chrome.storage.local.get( "workstationId", function ( items )
                                    {
                                        console.log(items.workstationId);
                                        text[5] = items.workstationId;
                                        text[6] = printNumber;


    var textToWrite = convertArrayToCSVBlob(text, textHeader);
    var textFileAsBlob = new Blob([textToWrite], {type:'text/csv'});
    //This makes sure bogus characters will not screw up the filename
    var desiredNameText = badgeNameText.replace(/[^\w\s]/gi, '');
    var fileNameToSaveAs = accountId +" - "+ desiredNameText +".csv";

    //This is the magic that actually downloads the file generated
    var downloadLink = document.createElement("a");
    downloadLink.download = fileNameToSaveAs;
    downloadLink.innerHTML = "Download File";
    if (window.webkitURL != null)
    {
        // Chrome allows the link to be clicked
        // without actually adding it to the DOM.
        downloadLink.href = window.webkitURL.createObjectURL(textFileAsBlob);
    }
    else
    {
        // Firefox requires the link to be added to the DOM
        // before it can be clicked.
        downloadLink.href = window.URL.createObjectURL(textFileAsBlob);
        downloadLink.onclick = destroyClickedElement;
        downloadLink.style.display = "none";
        document.body.appendChild(downloadLink);
    }
    downloadLink.click();

                                    } );
}

// This makes an array into a set of double quoted comma delimited text
// Which is used in comma delimited files
function convertArrayToCSVBlob(arrayToConvert, textHeader) {
    var str = "";
    str = textHeader + "\n";
    for (var i = 0; i < arrayToConvert.length - 1; i++) {
        var line = '';
        line += '"' + arrayToConvert[i] + '",';
        line.slice(0,line.Length-1);
        str += line;
    }
    str += '"' + arrayToConvert[arrayToConvert.length - 1] +'"';
    str += "\n";
    return str;
}
