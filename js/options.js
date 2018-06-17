// Saves options to chrome.storage.sync.
function save_options()
{
    var workstation = document.getElementById( 'workstation' ).value;
    //var scanner = document.getElementById( 'scanner' ).value;
    var mngtOverride = document.getElementById( 'mngtoverride' ).checked;
    //var websocketServer = document.getElementById('websocketserver').value;

    var pass1 = "password-goes-here";    //TODO Encode or encrypt this somehow
    if( mngtOverride )
    {

        var password = document.getElementById( 'mngt3' ).value;
        console.log( "PW: " + password );

        if( password == pass1 )
        {
            chrome.storage.local.set( {
                                         workstationId: workstation,
                                        // scanner: scanner,
                                        //  websocketServer: websocketServer,
                                         managementOverride: mngtOverride
                                     }, function ()
                                     {
                                         // Update status to let user know options were saved.
                                         var status = document.getElementById( 'status' );
                                         status.textContent = 'Options saved. ' + mngtOverride;
                                         setTimeout( function ()
                                                     {
                                                         status.textContent = '';
                                                     }, 750 );
                                     } );

        }
        else
        {
            var status = document.getElementById( 'status' );
            status.textContent = 'Options not saved.';
            setTimeout( function ()
                        {
                            status.textContent = '';
                        }, 750 );

        }

    }
    else
    {
        chrome.storage.local.set( {
                                                 workstationId: workstation,
                                               //  scanner: scanner,
                                               //   websocketServer: websocketServer,
                                                 managementOverride: mngtOverride
                                             }, function ()
                                             {
                                                 // Update status to let user know options were saved.
                                                 var status = document.getElementById( 'status' );
                                                 status.textContent = 'Options saved.';
                                                 setTimeout( function ()
                                                             {
                                                                 status.textContent = '';
                                                             }, 750 );
                                             } );

    }
}

// Restores using the preferences
// stored in chrome.storage.
function restore_options()
{
    // Use default value
    chrome.storage.local.get( {
                                 workstationId: 'Set Me',
                              //   scanner: 'none',
                              //    websocketServer: '',
                                 managementOverride: false
                             }, function ( items )
                             {
                                 document.getElementById( 'workstation' ).value = items.workstationId;
                               //  document.getElementById( 'scanner' ).value = items.scanner;
                               //  document.getElementById( 'websocketserver' ).value = items.websocketServer;
                                 document.getElementById( 'mngtoverride' ).checked = items.managementOverride;
                                 dynInput();
                             } );
}
document.addEventListener( 'DOMContentLoaded', restore_options );
document.getElementById( 'save' ).addEventListener( 'click',
                                                    save_options );

document.getElementById( 'mngtoverride' ).addEventListener( 'click',
                                                            dynInput );

function dynInput()
{
    var cbox = document.getElementById( 'mngtoverride' );
    if( cbox.checked )
    {
        var input = document.createElement( "input" );
        input.type = "password";
        input.id = "mngt3";
        var div = document.createElement( "div" );
        div.id = 'mngt2';
        div.innerHTML = "Management PW " + cbox.name;
        div.appendChild( input );
        document.getElementById( "insertinputs" ).appendChild( div );
    }
    else
    {
        document.getElementById( 'mngt2' ).remove();
    }
}
