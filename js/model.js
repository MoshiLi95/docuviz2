var $ = jQuery.noConflict();

// "Array.prototype" allows us to add aditional methods to the Array object. Here we add "insert" and "delete" methods

// "insert" method lets us add an element at any index
// e.g.
// [a,b,d].insert('c', 2); // [a,b,c,d]
Array.prototype.insert = function(element, index) {
    this.splice(index, 0, element);
}

// "remove" method lets us remove elements within index range
// e.g.
// [a,b,c,d].remove(0, 2); // [d]
Array.prototype.delete = function(startIndex, endIndex) {
    return this.splice(startIndex, (endIndex - startIndex) + 1);
}


String.prototype.insert = function(index, string) {
    if (index > 0)
        return this.substring(0, index) + string + this.substring(index, this.length);
    else
        return string + this;
}


// If authorviz is already exist, use it. Otherwise make a new object
window.docuviz = window.docuviz || {}

$.extend(window.docuviz, {

    // "str" stores all the Character objects from a Google Doc
    str: [],
    allSegmentsInCurrentRev: [],
    firstRevisionSegments: [],
    segmentsArray: [],
    revID: 0,
    currentSegID: 0,
    statisticDataArray: [], // new

    renderToString: function(chars) {
        return _.reduce(chars, function(memo, obj) {
            if (obj.s === "\n") {
                return memo + "\n";
            } else {
                return memo + obj.s;
            }

        }, '');
    },

    //new:
    statisticDataObject: function(authorName, authorId, selfEdit, otherEdit, totalEdit){
        return {
            authorName: authorName,
            authorId: authorId,
            selfEdit: selfEdit,
            otherEdit: otherEdit,
            totalEdit: totalEdit
        }
    },

    // constructSegmentForFrontend is the actual segment that will be passed to the View, it only contains the information needed
    // to draw Docuviz 
    constructSegmentForFrontend: function(authorColor, segID, parentSegID, offset, segStr, segLength, revID, startIndex, endIndex) {
        return {
            authorColor: authorColor,
            segID: segID,
            parentSegID: parentSegID,
            offset: offset,
            segStr: segStr,
            segLength: segLength,
            revID: revID,
            startIndex: startIndex,
            endIndex: endIndex
        };
    },

    // constructSegment is a segment object that has more information for constructing inside model.js 
    constructSegment: function(authorId, segStr, segID, parentSegID, offset, revID, startIndex, endIndex, type, permanentFlag) {
        return {

        	startIndex: startIndex,
        	endIndex: endIndex,
        	segStr: segStr,
        	permanentFlag: permanentFlag,
            segID: segID,
            parentSegID: parentSegID,
            offset: offset,
            revID: revID,
            authorId: authorId,
            type: type
        };
    },

    analyzeEachEditInChangelog: function(entry, authorId, currentRevID, currentSegID, segsInFirstRev) {
        var that = this,
            type = entry.ty,
            insertStartIndex = null,
            deleteStartIndex = null,
            deleteEndIndex = null;

        if (type === 'mlti') {
            _.each(entry.mts, function(ent) {
                that.analyzeEachEditInChangelog(ent, authorId, currentRevID, currentSegID, segsInFirstRev);
            });
        } else if (type === 'rplc') {
            _.each(entry.snapshot, function(ent) {
                that.analyzeEachEditInChangelog(ent, authorId, currentRevID, currentSegID, segsInFirstRev);
            });

        } else if (type === 'rvrt') {
            that.str = [];
            that.allSegmentsInCurrentRev = [];
            _.each(entry.snapshot, function(ent) {
                that.analyzeEachEditInChangelog(ent, authorId, currentRevID, currentSegID, segsInFirstRev);
            });

        } else if (type === 'is' || type === 'iss') {

            insertStartIndex = entry.ibi - 1;
            that.allSegmentsInCurrentRev = that.buildSegmentsWhenInsert(entry.s, insertStartIndex, authorId, that.allSegmentsInCurrentRev);

            // new
            _.find(that.statisticDataArray, function(eachAuthor){
                if (eachAuthor.authorId === authorId){
                    eachAuthor.totalEdit += entry.s.length;
                }
            });


            _.each(entry.s, function(character, index) {
                var charObj = {
                    s: character,
                    aid: authorId
                };
                that.str.insert(charObj, insertStartIndex  + index);
            });


        } else if (type === 'ds' || type === 'dss') {

            deleteStartIndex = entry.si - 1;
            deleteEndIndex = entry.ei - 1;

            // new
            _.find(that.statisticDataArray, function(eachAuthor){
                if (eachAuthor.authorId === authorId){
                    eachAuthor.totalEdit += deleteEndIndex - deleteStartIndex + 1;
                }
            });

            that.str.delete(deleteStartIndex, deleteEndIndex);
            that.allSegmentsInCurrentRev = that.buildSegmentsWhenDelete(deleteStartIndex, deleteEndIndex, authorId, that.allSegmentsInCurrentRev);
        }
        // else if (type === 'as' && entry.st === 'paragraph'){
        //     insertStartIndex = entry.si -1;
        //     that.allSegmentsInCurrentRev = that.buildSegmentsWhenInsert('', insertStartIndex, authorId, that.allSegmentsInCurrentRev);
        //     var charObj = {
        //         s: ' ',
        //         aid: authorId
        //     };
        //     that.str.insert(charObj, insertStartIndex);  
        // }
        else {

        	// all other types such as AS (formatting)
        }

        return true;
    },

    // calculate the revision's contributions Nov 02, 2015 by Kenny
    calculateRevContribution: function(revisionData, authors) {
        var newRevisionData = [];
        _.each(revisionData, function(eachRevision){
            var revContribution = []
            _.each(authors, function(eachAuthor){
                var sum = 0;
                _.each(eachRevision[3], function(eachSegment){
                    if (eachAuthor.color === eachSegment.authorColor){
                        sum += eachSegment.segLength;
                    }
                });
                revContribution.push({author: eachAuthor, contributionLength: sum});
            });

            eachRevision.push(revContribution);
            newRevisionData.push(eachRevision);
        });

        return newRevisionData;
    },

    buildRevisions: function(vizType, docId, changelog, authors, revTimestamps, revAuthors) {
        // Clear previous revision data
        this.str = [];
        this.firstRevisionSegments = [];
        this.currentSegID = 0;
        this.revID = 0;
        this.allSegmentsInCurrentRev = [];
        this.segmentsArray = [];
        this.statisticDataArray = [];

        console.log(changelog);

        var that = this,
            soFar = 0,
            editCount = changelog.length,
            html = '',
            command = null,
            authorId = null,
            revsForFrontend = [],
            //currentRevID = 0,
            //segsInFirstRev = null,
            differentAuthor = null;

        // an array of the cutting index of edits, e.g., [0,21,32] meaning: rev0 has 0, rev1 has 1-21, rev2 has 22-32
        var intervalChangesIndex = [];
        intervalChangesIndex = this.calculateIntervalChangesIndex(changelog, revTimestamps);
        if(intervalChangesIndex.length === 0) {
        	// Something is wrong, we didn't get changelog, or the cutting point
        	console.log("Check point 1");
        }

        // console.log(intervalChangesIndex);


        // new
        // initialize the statisticDataArray:
        _.each(authors, function(eachAuthor){
            that.statisticDataArray.push(that.statisticDataObject(eachAuthor.name, eachAuthor.id, 0, 0, 0)); // initalize the array with author's name, author's id, selfEdit =0, otherEdit = 0,totalEdit = 0
        });

        console.log("statisticDataArray: ");
        console.log(that.statisticDataArray);



        // Async run through each entry in a synchronous sequence.
        async.eachSeries(changelog, function(entry, callBack) {
            authorId = entry[2],
            command = entry[0];

            // Find author object based on authorId:

            var currentAuthor = _.find(authors, function(eachAuthor) {
                return eachAuthor.id === authorId;
            });


            // Retrieve the Google Doc Tab and send a message to that Tab's view
            chrome.tabs.query({
                url: '*://docs.google.com/*/' + docId + '/edit*'
            }, function(tabs) {

                chrome.tabs.sendMessage(tabs[0].id, {
                    msg: 'progress',
                    soFar: soFar + 1
                }, function(response) {

                    that.analyzeEachEditInChangelog(command, authorId, that.revID, that.currentSegID, that.allSegmentsInCurrentRev);                    

                    if (soFar === intervalChangesIndex[that.revID] ) {
                    	// var index = 0;
                        // change all segments'revID to the same revID
                        _.each(that.allSegmentsInCurrentRev, function(eachSegment) {
                            eachSegment.revID = that.revID;
                            eachSegment.permanentFlag = true;
                            // eachSegment.startIndex = index;
                            // index += (eachSegment.segStr.length - 1);
                            // eachSegment.endIndex = index;
                            // index += 1;
                        });

                        var revLength = that.str.length;
                        // convert every segments into constructSegmentForFrontend object:
                        var segmentsForFrontend = that.buildSegmentsForOneRevision(that.allSegmentsInCurrentRev, authors);

                        revsForFrontend.push([revLength, revTimestamps[that.revID], revAuthors[that.revID], segmentsForFrontend]);
                        console.log("allSegmentsInCurrentRev for revisionID: " + that.revID);
                        console.log(that.allSegmentsInCurrentRev);

                        // update the current revision id
                        that.revID += 1;

                    } else {
                        
                    }


                    // reaching the end of changelog, calculate the contributions and push it to frontend
                    if (soFar === (editCount-1) ) {
                    	// calculate the revision's contributions, edit Nov 02, 2015 by Kenny
                    	var revDataWithContribution = that.calculateRevContribution(revsForFrontend, authors);
                        // console.log(that.allSegmentsInCurrentRev);
                    	chrome.tabs.query({
                    	    url: '*://docs.google.com/*/' + docId + '/edit*'
                    	}, function(tabs) {
                    	    chrome.tabs.sendMessage(tabs[0].id, {
                    	        msg: 'renderDocuviz',
                    	        chars: that.str,
                    	        // calculate the revision's contributions, edit Nov 02, 2015 by Kenny
                    	        revData: revDataWithContribution,
                                statisticData: that.statisticDataArray // new
                    	    }, function(response) {});
                    	});
                    }
                    else{

                    }

                    // update soFar
                    soFar += 1;

                    // Callback lets async knows that the sequence is finished can it can start run another entry           
                    callBack();
                    
                }
                );
				// End of chrome.tabs.sendMessage function
            });
			// End of chrome.tabs.query function.
        });
		// End of async
    },

    // Creating the new segment, breaking the effected old segment if necessary, and updating all the following startIndex and endIndex
    buildSegmentsWhenInsert: function(entryStr, startIndex, authorId, segmentsArray) {

        var that = this;

        var effectedSegment = null;
        var segmentLocation = null;

        if(segmentsArray != null){ // it shouldn't be, it could be empty, but not null.
            
	        effectedSegment = _.find(segmentsArray, function(eachSegment, index) {

	        	if (eachSegment.startIndex < startIndex && startIndex <= eachSegment.endIndex) {
	                segmentLocation = index;
	                return eachSegment;
	            }
                else if (startIndex === eachSegment.startIndex) {
                    segmentLocation = index;
                    return eachSegment;
                    
                }
	            else if (startIndex === (eachSegment.endIndex + 1) ){

	            	if (index === (segmentsArray.length - 1) ){
                        segmentLocation = index;
                        return eachSegment;
                    }
                    else {

                    }
	            }

	            else {
	            	// do nothing, keep looking
	            }
	        });
            
		}

		// meaning, the segmentsArray is empty
        if (effectedSegment === undefined) {
            that.currentSegID += 1;
            if (segmentsArray.length === 0) {
            	if (entryStr.length === 0){ // When an author inserts nothing right at the begining, which made the endIndex to be -1. This statement solve that problem, endIndex when be 0.
            	    var currentSeg = that.constructSegment(authorId, entryStr, that.currentSegID, that.currentSegID, 0, that.revID, startIndex, (startIndex + entryStr.length), "new segment because of no previous segment when entryStr.length === 0", false);
            	}
            	else{
            	    var currentSeg = that.constructSegment(authorId, entryStr, that.currentSegID, that.currentSegID, 0, that.revID, startIndex, (startIndex + entryStr.length - 1), "new segment because of no previous segment", false);    
            	}
            	segmentsArray.insert(currentSeg,segmentsArray.length);
                // new
                _.find(that.statisticDataArray, function(eachAuthor){
                    if (eachAuthor.authorId === authorId){
                        eachAuthor.selfEdit += entryStr.length;
                    }
                });


            }
            // has something in the array but couldn't find the effected, because the comment insert at the end+1
            else{
            	var currentSeg = that.constructSegment(authorId, entryStr, that.currentSegID, that.currentSegID, 0, that.revID, (segmentsArray[(segmentsArray.length-1)].endIndex+1), ((segmentsArray[(segmentsArray.length-1)].endIndex+1) + entryStr.length - 1), "new segment at the end because of couldn't find previous segment", false);    
            	
            	segmentsArray.insert(currentSeg,segmentsArray.length);
                // new
                _.find(that.statisticDataArray, function(eachAuthor){
                    if (eachAuthor.authorId === authorId){
                        eachAuthor.selfEdit += entryStr.length;
                    }
                });
            }
        } 

        
        else {
        	if(effectedSegment.startIndex === startIndex){

        		if (startIndex === 0){
        			if (effectedSegment.permanentFlag === true){
        				that.currentSegID += 1;
        				var currentSeg = that.constructSegment(authorId, entryStr, that.currentSegID, that.currentSegID, 0, that.revID, startIndex, (startIndex + entryStr.length - 1), "new segment and found the effected segment, permanentflag = true, when effectedSegment.startIndex === startIndex and startIndex === 0", false);
        				segmentsArray.insert(currentSeg, segmentLocation );

			    		for (var i = (segmentLocation + 1); i < segmentsArray.length; i++) {
					    	segmentsArray[i].startIndex += entryStr.length;
					    	segmentsArray[i].endIndex += entryStr.length;
			    		}
                        // new
                        if (effectedSegment.authorId === authorId) {
                            _.find(that.statisticDataArray, function(eachAuthor){
                                if (eachAuthor.authorId === authorId){
                                    eachAuthor.selfEdit += entryStr.length;
                                }
                            });
                        }
                        else{
                            _.find(that.statisticDataArray, function(eachAuthor){
                                if (eachAuthor.authorId === authorId){
                                    eachAuthor.otherEdit += entryStr.length;
                                }
                            });     
                        }
        			}
        			else {
        				if (effectedSegment.authorId === authorId) {
	        				effectedSegment.segStr = entryStr + effectedSegment.segStr;
		            		effectedSegment.endIndex += entryStr.length;

                            // new
                            _.find(that.statisticDataArray, function(eachAuthor){
                                if (eachAuthor.authorId === authorId){
                                    eachAuthor.selfEdit += entryStr.length;
                                }
                            });

	            		}
	            		else {
	            			that.currentSegID += 1;
	            			var currentSeg = that.constructSegment(authorId, entryStr, that.currentSegID, that.currentSegID, 0, that.revID, startIndex, (startIndex + entryStr.length - 1), "new segment and found the effected segment, permanentflag = false,  authorId != , when effectedSegment.startIndex === startIndex and startIndex === 0", false);
	            			segmentsArray.insert(currentSeg, segmentLocation );

                            // new
                            _.find(that.statisticDataArray, function(eachAuthor){
                                if (eachAuthor.authorId === authorId){
                                    eachAuthor.otherEdit += entryStr.length;
                                }
                            });     
                        

	            		}
			    		for (var i = (segmentLocation + 1); i < segmentsArray.length; i++) {
					    	segmentsArray[i].startIndex += entryStr.length;
					    	segmentsArray[i].endIndex += entryStr.length;
			    		}
        			}
        		}
        		else if ( ((effectedSegment.endIndex+1) ===  startIndex )&& (segmentLocation === (segmentsArray.length-1 ))){
        			if (effectedSegment.permanentFlag === true){
        				that.currentSegID += 1;
        				var currentSeg = that.constructSegment(authorId, entryStr, that.currentSegID, that.currentSegID, 0, that.revID, startIndex, (startIndex + entryStr.length - 1), "new segment and found the effected segment, permanentflag = true, when ((effectedSegment.endIndex+1) ===  startIndex )&& (segmentLocation === (segmentsArray.length-1 ))", false);
        				segmentsArray.insert(currentSeg, (segmentLocation+1) );

                        // new
                        if (effectedSegment.authorId === authorId) {
                            _.find(that.statisticDataArray, function(eachAuthor){
                                if (eachAuthor.authorId === authorId){
                                    eachAuthor.selfEdit += entryStr.length;
                                }
                            });
                        }
                        else{
                            _.find(that.statisticDataArray, function(eachAuthor){
                                if (eachAuthor.authorId === authorId){
                                    eachAuthor.otherEdit += entryStr.length;
                                }
                            });     
                        }
        			}
        			else {
        				if(effectedSegment.authorId === authorId){
        					effectedSegment.segStr += entryStr;
	            			effectedSegment.endIndex += entryStr.length;

                            // new
                            _.find(that.statisticDataArray, function(eachAuthor){
                                if (eachAuthor.authorId === authorId){
                                    eachAuthor.selfEdit += entryStr.length;
                                }
                            });

	            		}
	            		else{
	            			that.currentSegID += 1;
	            			var currentSeg = that.constructSegment(authorId, entryStr, that.currentSegID, that.currentSegID, 0, that.revID, startIndex, (startIndex + entryStr.length - 1), "new segment and found the effected segment, differentAuthor, permanentflag=false, when ((effectedSegment.endIndex+1) ===  startIndex )&& (segmentLocation === (segmentsArray.length-1 ))", false);
	            			segmentsArray.insert(currentSeg, (segmentLocation+1) );

                            // new
                            _.find(that.statisticDataArray, function(eachAuthor){
                                if (eachAuthor.authorId === authorId){
                                    eachAuthor.otherEdit += entryStr.length;
                                }
                            });            
	            		}
        			}
        		}
        		else{
        			if(effectedSegment.permanentFlag === true && segmentsArray[segmentLocation-1].permanentFlag === true){
        				that.currentSegID += 1;
        				var currentSeg = that.constructSegment(authorId, entryStr, that.currentSegID, that.currentSegID, 0, that.revID, startIndex, (startIndex + entryStr.length - 1), "new segment insert between two permanentflag== true", false);
        				segmentsArray.insert(currentSeg, segmentLocation );
			    		for (var i = (segmentLocation + 1); i < segmentsArray.length; i++) {
					    	segmentsArray[i].startIndex += entryStr.length;
					    	segmentsArray[i].endIndex += entryStr.length;
			    		}
                        // new
                        if (effectedSegment.authorId === authorId) {
                            _.find(that.statisticDataArray, function(eachAuthor){
                                if (eachAuthor.authorId === authorId){
                                    eachAuthor.selfEdit += entryStr.length;
                                }
                            });
                        }
                        else{
                            _.find(that.statisticDataArray, function(eachAuthor){
                                if (eachAuthor.authorId === authorId){
                                    eachAuthor.otherEdit += entryStr.length;
                                }
                            });     
                        }

        			}
        			else if (effectedSegment.permanentFlag === true && segmentsArray[segmentLocation-1].permanentFlag === false){
        				if (segmentsArray[segmentLocation-1].authorId === authorId){
	        				segmentsArray[segmentLocation-1].segStr += entryStr;
		            		segmentsArray[segmentLocation-1].endIndex += entryStr.length;
        		    		for (var i = segmentLocation; i < segmentsArray.length; i++) {
        				    	segmentsArray[i].startIndex += entryStr.length;
        				    	segmentsArray[i].endIndex += entryStr.length;
        		    		}

                            // new
                            _.find(that.statisticDataArray, function(eachAuthor){
                                if (eachAuthor.authorId === authorId){
                                    eachAuthor.selfEdit += entryStr.length;
                                }
                            });

        				}
        				else{
	        				that.currentSegID += 1;
	        				var currentSeg = that.constructSegment(authorId, entryStr, that.currentSegID, that.currentSegID, 0, that.revID, startIndex, (startIndex + entryStr.length - 1), "new segment after a temporary segment with differentAuthor, before a permanent segment", false);
	        				segmentsArray.insert(currentSeg, segmentLocation );
				    		for (var i = (segmentLocation + 1); i < segmentsArray.length; i++) {
						    	segmentsArray[i].startIndex += entryStr.length;
						    	segmentsArray[i].endIndex += entryStr.length;
				    		}

                            // new
                            _.find(that.statisticDataArray, function(eachAuthor){
                                if (eachAuthor.authorId === authorId){
                                    eachAuthor.otherEdit += entryStr.length;
                                }
                            });

        				}
        			}
        			else if (effectedSegment.permanentFlag === false && segmentsArray[segmentLocation-1].permanentFlag === true){
        				if (effectedSegment.authorId === authorId){
	        				effectedSegment.segStr = entryStr + effectedSegment.segStr;
		            		effectedSegment.endIndex += entryStr.length;
        		    		for (var i = (segmentLocation + 1); i < segmentsArray.length; i++) {
        				    	segmentsArray[i].startIndex += entryStr.length;
        				    	segmentsArray[i].endIndex += entryStr.length;
        		    		}

                            // new
                            _.find(that.statisticDataArray, function(eachAuthor){
                                if (eachAuthor.authorId === authorId){
                                    eachAuthor.selfEdit += entryStr.length;
                                }
                            });

        				}
        				else{
	        				that.currentSegID += 1;
	        				var currentSeg = that.constructSegment(authorId, entryStr, that.currentSegID, that.currentSegID, 0, that.revID, startIndex, (startIndex + entryStr.length - 1), "new segment, after a permanent, before a temporary but differentAuthor", false);
	        				segmentsArray.insert(currentSeg, segmentLocation );
				    		for (var i = (segmentLocation + 1); i < segmentsArray.length; i++) {
						    	segmentsArray[i].startIndex += entryStr.length;
						    	segmentsArray[i].endIndex += entryStr.length;
				    		}

                            // new
                            _.find(that.statisticDataArray, function(eachAuthor){
                                if (eachAuthor.authorId === authorId){
                                    eachAuthor.otherEdit += entryStr.length;
                                }
                            });
        				}
        			}
        			else{
        				if (effectedSegment.authorId === authorId){
	        				effectedSegment.segStr = entryStr + effectedSegment.segStr;
		            		effectedSegment.endIndex += entryStr.length;
        		    		for (var i = (segmentLocation + 1); i < segmentsArray.length; i++) {
        				    	segmentsArray[i].startIndex += entryStr.length;
        				    	segmentsArray[i].endIndex += entryStr.length;
        		    		}

                            // new
                            _.find(that.statisticDataArray, function(eachAuthor){
                                if (eachAuthor.authorId === authorId){
                                    eachAuthor.selfEdit += entryStr.length;
                                }
                            });

        				}
        				else if (segmentsArray[segmentLocation-1].authorId === authorId) {
	        				segmentsArray[segmentLocation-1].segStr += entryStr;
		            		segmentsArray[segmentLocation-1].endIndex += entryStr.length;
        		    		for (var i = segmentLocation; i < segmentsArray.length; i++) {
        				    	segmentsArray[i].startIndex += entryStr.length;
        				    	segmentsArray[i].endIndex += entryStr.length;
        		    		}
                            // new
                            _.find(that.statisticDataArray, function(eachAuthor){
                                if (eachAuthor.authorId === authorId){
                                    eachAuthor.selfEdit += entryStr.length;
                                }
                            });
        				}
        				else{
	        				that.currentSegID += 1;
	        				var currentSeg = that.constructSegment(authorId, entryStr, that.currentSegID, that.currentSegID, 0, that.revID, startIndex, (startIndex + entryStr.length - 1), "new segment, between two temporary but differentAuthor", false);
	        				segmentsArray.insert(currentSeg, segmentLocation );
				    		for (var i = (segmentLocation + 1); i < segmentsArray.length; i++) {
						    	segmentsArray[i].startIndex += entryStr.length;
						    	segmentsArray[i].endIndex += entryStr.length;
				    		}


                            // new
                            _.find(that.statisticDataArray, function(eachAuthor){
                                if (eachAuthor.authorId === authorId){
                                    eachAuthor.otherEdit += entryStr.length;
                                }
                            });
        				}
        			}
        		}

	        }
            	
        	else if (startIndex === (effectedSegment.endIndex + 1)){

        		if (segmentLocation ===  (segmentsArray.length-1)){
        			if (effectedSegment.permanentFlag === true){
	        			that.currentSegID += 1;
	        			var currentSeg = that.constructSegment(authorId, entryStr, that.currentSegID, that.currentSegID, 0, that.revID, startIndex, (startIndex + entryStr.length - 1), "new segment and found the effected segment, not the same author when segmentLocation ===  (segmentsArray.length-1)", false);
	        			segmentsArray.insert(currentSeg, (segmentLocation+1) );

                        // new
                        if (effectedSegment.authorId === authorId){
                            _.find(that.statisticDataArray, function(eachAuthor){
                                if (eachAuthor.authorId === authorId){
                                    eachAuthor.selfEdit += entryStr.length;
                                }
                            });      
                        }

                        else{
                            _.find(that.statisticDataArray, function(eachAuthor){
                                if (eachAuthor.authorId === authorId){
                                    eachAuthor.otherEdit += entryStr.length;
                                }
                            });           
                        }
        			}
        			else{
                        
        				if (effectedSegment.authorId != authorId){
        					that.currentSegID += 1;
        					var currentSeg = that.constructSegment(authorId, entryStr, that.currentSegID, that.currentSegID, 0, that.revID, startIndex, (startIndex + entryStr.length - 1), "new segment and found the effected segment, not the same author when segmentLocation ===  (segmentsArray.length-1)", false);
        					segmentsArray.insert(currentSeg, (segmentLocation+1) );
                            // new
                            _.find(that.statisticDataArray, function(eachAuthor){
                                if (eachAuthor.authorId === authorId){
                                    eachAuthor.otherEdit += entryStr.length;
                                }
                            });
        				}
        				else{
        					effectedSegment.segStr += entryStr;
	            			effectedSegment.endIndex += entryStr.length;

                            // new
                            _.find(that.statisticDataArray, function(eachAuthor){
                                if (eachAuthor.authorId === authorId){
                                    eachAuthor.selfEdit += entryStr.length;
                                }
                            });
        				}
        			}
        		}	
        		else{
        			if (effectedSegment.permanentFlag === true && segmentsArray[segmentLocation+1].permanentFlag === true){
        				that.currentSegID += 1;
        				var currentSeg = that.constructSegment(authorId, entryStr, that.currentSegID, that.currentSegID, 0, that.revID, startIndex, (startIndex + entryStr.length - 1), "new segment and found the effected segment, between two permanentFlag === true", false);
        				segmentsArray.insert(currentSeg, (segmentLocation+1) );

			    		for (var i = (segmentLocation + 2); i < segmentsArray.length; i++) {
					    	segmentsArray[i].startIndex += entryStr.length;
					    	segmentsArray[i].endIndex += entryStr.length;
			    		}

                        // new
                        if (effectedSegment.authorId === authorId){
                            _.find(that.statisticDataArray, function(eachAuthor){
                                if (eachAuthor.authorId === authorId){
                                    eachAuthor.selfEdit += entryStr.length;
                                }
                            });      
                        }

                        else{
                            _.find(that.statisticDataArray, function(eachAuthor){
                                if (eachAuthor.authorId === authorId){
                                    eachAuthor.otherEdit += entryStr.length;
                                }
                            });           
                        }

        			}
        			else if (effectedSegment.permanentFlag === true && segmentsArray[segmentLocation+1].permanentFlag === false){
        				if( segmentsArray[segmentLocation+1].authorId === authorId){
	        				segmentsArray[segmentLocation+1].segStr = entryStr + segmentsArray[segmentLocation+1].segStr;
		            		segmentsArray[segmentLocation+1].endIndex += entryStr.length;
        		    		for (var i = (segmentLocation + 2); i < segmentsArray.length; i++) {
        				    	segmentsArray[i].startIndex += entryStr.length;
        				    	segmentsArray[i].endIndex += entryStr.length;
        		    		}

                            // new
                            _.find(that.statisticDataArray, function(eachAuthor){
                                if (eachAuthor.authorId === authorId){
                                    eachAuthor.selfEdit += entryStr.length;
                                }
                            });

        				}
        				else{
	        				that.currentSegID += 1;
	        				var currentSeg = that.constructSegment(authorId, entryStr, that.currentSegID, that.currentSegID, 0, that.revID, startIndex, (startIndex + entryStr.length - 1), "new segment and found the effected segment, between two permanentFlag === true", false);
	        				segmentsArray.insert(currentSeg, (segmentLocation+1) );

				    		for (var i = (segmentLocation + 2); i < segmentsArray.length; i++) {
						    	segmentsArray[i].startIndex += entryStr.length;
						    	segmentsArray[i].endIndex += entryStr.length;
				    		}
                            // new
                            _.find(that.statisticDataArray, function(eachAuthor){
                                if (eachAuthor.authorId === authorId){
                                    eachAuthor.otherEdit += entryStr.length;
                                }
                            });

        				}
        			}
        			else if (effectedSegment.permanentFlag === false && segmentsArray[segmentLocation+1].permanentFlag === true) {
        				if( effectedSegment.authorId === authorId){
        					effectedSegment.segStr += entryStr;
	            			effectedSegment.endIndex += entryStr.length;

    			    		for (var i = (segmentLocation + 1); i < segmentsArray.length; i++) {
    					    	segmentsArray[i].startIndex += entryStr.length;
    					    	segmentsArray[i].endIndex += entryStr.length;
    			    		}

                            // new
                            _.find(that.statisticDataArray, function(eachAuthor){
                                if (eachAuthor.authorId === authorId){
                                    eachAuthor.selfEdit += entryStr.length;
                                }
                            });

        				}
        				else{
	        				that.currentSegID += 1;
	        				var currentSeg = that.constructSegment(authorId, entryStr, that.currentSegID, that.currentSegID, 0, that.revID, startIndex, (startIndex + entryStr.length - 1), "new segment and found the effected segment, between two permanentFlag === true", false);
	        				segmentsArray.insert(currentSeg, (segmentLocation+1) );

				    		for (var i = (segmentLocation + 2); i < segmentsArray.length; i++) {
						    	segmentsArray[i].startIndex += entryStr.length;
						    	segmentsArray[i].endIndex += entryStr.length;
				    		}

                            // new
                            _.find(that.statisticDataArray, function(eachAuthor){
                                if (eachAuthor.authorId === authorId){
                                    eachAuthor.otherEdit += entryStr.length;
                                }
                            });
        				}
        			}
        			else {
        				if(effectedSegment.authorId ===authorId && segmentsArray[segmentLocation+1].authorId != authorId){

				    		effectedSegment.segStr += entryStr;
				    		effectedSegment.endIndex += entryStr.length;

	    		    		for (var i = (segmentLocation + 1); i < segmentsArray.length; i++) {
	    				    	segmentsArray[i].startIndex += entryStr.length;
	    				    	segmentsArray[i].endIndex += entryStr.length;
	    		    		}

                            // new
                            _.find(that.statisticDataArray, function(eachAuthor){
                                if (eachAuthor.authorId === authorId){
                                    eachAuthor.selfEdit += entryStr.length;
                                }
                            });

        				}
        				else if (effectedSegment.authorId != authorId && segmentsArray[segmentLocation+1].authorId === authorId) {
        					segmentsArray[(segmentLocation+1)].segStr = entryStr + segmentsArray[segmentLocation+1].segStr;
        					segmentsArray[(segmentLocation+1)].endIndex += entryStr.length;
				    		for (var i = (segmentLocation + 2); i < segmentsArray.length; i++) {
						    	segmentsArray[i].startIndex += entryStr.length;
						    	segmentsArray[i].endIndex += entryStr.length;
				    		}

                            // new
                            _.find(that.statisticDataArray, function(eachAuthor){
                                if (eachAuthor.authorId === authorId){
                                    eachAuthor.selfEdit += entryStr.length;
                                }
                            });
        				}
        				else if (effectedSegment.authorId != authorId && segmentsArray[segmentLocation+1].authorId != authorId) {
            				// create the new segment and update
            				that.currentSegID += 1;
            				var currentSeg = that.constructSegment(authorId, entryStr, that.currentSegID, that.currentSegID, 0, that.revID, startIndex, startIndex + entryStr.length - 1, "new segment between two temporary but differentAuthor segments", false);
            				segmentsArray.insert(currentSeg, (segmentLocation+1) );
				    		for (var i = (segmentLocation + 2); i < segmentsArray.length; i++) {
						    	segmentsArray[i].startIndex += entryStr.length;
						    	segmentsArray[i].endIndex += entryStr.length;
				    		}

                            // new
                            _.find(that.statisticDataArray, function(eachAuthor){
                                if (eachAuthor.authorId === authorId){
                                    eachAuthor.otherEdit += entryStr.length;
                                }
                            });

        				}
        				else {
				    		effectedSegment.segStr += entryStr;
				    		effectedSegment.endIndex += entryStr.length;

	    		    		for (var i = (segmentLocation + 1); i < segmentsArray.length; i++) {
	    				    	segmentsArray[i].startIndex += entryStr.length;
	    				    	segmentsArray[i].endIndex += entryStr.length;
	    		    		}

                            // new
                            if (effectedSegment.authorId === authorId){
                                _.find(that.statisticDataArray, function(eachAuthor){
                                    if (eachAuthor.authorId === authorId){
                                        eachAuthor.selfEdit += entryStr.length;
                                    }
                                });      
                            }

                            else{
                                _.find(that.statisticDataArray, function(eachAuthor){
                                    if (eachAuthor.authorId === authorId){
                                        eachAuthor.otherEdit += entryStr.length;
                                    }
                                });           
                            }

        				}
        			}
        		}
        		
        	}
        	else if (effectedSegment.startIndex < startIndex && startIndex <= effectedSegment.endIndex) {

        		if (effectedSegment.permanentFlag === true) {

                    if (effectedSegment.startIndex === effectedSegment.endIndex) {

                        that.currentSegID += 1;
                        var currentSeg = that.constructSegment(authorId, entryStr, that.currentSegID, that.currentSegID, 0, that.revID, startIndex, (startIndex + entryStr.length - 1), "new insert segment in the middle of the found permanent effected segment", false);
                        segmentsArray.insert(currentSeg, (segmentLocation) );
                        for (var i = (segmentLocation + 1); i < segmentsArray.length; i++) {
                            segmentsArray[i].startIndex += entryStr.length;
                            segmentsArray[i].endIndex += entryStr.length;
                        }
                        // new
                        if (effectedSegment.authorId === authorId){
                            _.find(that.statisticDataArray, function(eachAuthor){
                                if (eachAuthor.authorId === authorId){
                                    eachAuthor.selfEdit += entryStr.length;
                                }
                            });      
                        }

                        else{
                            _.find(that.statisticDataArray, function(eachAuthor){
                                if (eachAuthor.authorId === authorId){
                                    eachAuthor.otherEdit += entryStr.length;
                                }
                            });           
                        }


                    }

                    else {

            			var strBeforeStartIndex = effectedSegment.segStr.substring(0, startIndex - effectedSegment.startIndex);
            			var strAfterStartIndex = effectedSegment.segStr.substring(startIndex - effectedSegment.startIndex);

            			that.currentSegID += 1;
            			var segBefore = that.constructSegment(effectedSegment.authorId, strBeforeStartIndex, that.currentSegID, effectedSegment.segID, 0, that.revID, effectedSegment.startIndex, (startIndex - 1), "from buildSegmentsWhenInsert Before when permanentFlag = true", false);
            			segmentsArray.insert(segBefore, segmentLocation);

    				    that.currentSegID += 1;
    				    var currentSeg = that.constructSegment(authorId, entryStr, that.currentSegID, that.currentSegID, 0, that.revID, startIndex, (startIndex + entryStr.length - 1), "new insert segment in the middle of the found permanent effected segment", false);
    		    		segmentsArray.insert(currentSeg, (segmentLocation + 1) );

    				    that.currentSegID += 1;
    				    var offset = startIndex - effectedSegment.startIndex;
    				    var segAfter = that.constructSegment(effectedSegment.authorId, strAfterStartIndex, that.currentSegID, effectedSegment.segID, offset, that.revID, (startIndex + entryStr.length ), (effectedSegment.endIndex + entryStr.length), "from buildSegmentsWhenInsert After when permanentFlag = true", false);

        		        segmentsArray.insert(segAfter, (segmentLocation + 2) );

        		        segmentsArray.delete( (segmentLocation + 3 ), (segmentLocation + 3 ));

                		for (var i = (segmentLocation + 3); i < segmentsArray.length; i++) {
            		    	segmentsArray[i].startIndex += entryStr.length;
            		    	segmentsArray[i].endIndex += entryStr.length;
                		}

                        // new
                        if (effectedSegment.authorId === authorId){
                            _.find(that.statisticDataArray, function(eachAuthor){
                                if (eachAuthor.authorId === authorId){
                                    eachAuthor.selfEdit += entryStr.length;
                                }
                            });      
                        }

                        else{
                            _.find(that.statisticDataArray, function(eachAuthor){
                                if (eachAuthor.authorId === authorId){
                                    eachAuthor.otherEdit += entryStr.length;
                                }
                            });           
                        }

                    }

        		}
        		else{

        			if(effectedSegment.authorId === authorId){
                        if (effectedSegment.startIndex === effectedSegment.endIndex){
                            effectedSegment.segStr = entryStr + effectedSegment.segStr;
                            effectedSegment.endIndex += entryStr.length;
                            for (var i = (segmentLocation + 1); i < segmentsArray.length; i++) {
                                segmentsArray[i].startIndex += entryStr.length;
                                segmentsArray[i].endIndex += entryStr.length;
                            }

                            // new
                            _.find(that.statisticDataArray, function(eachAuthor){
                                if (eachAuthor.authorId === authorId){
                                    eachAuthor.selfEdit += entryStr.length;
                                }
                            });
                        }

                        else{
            				var strBeforeStartIndex = effectedSegment.segStr.substring(0, startIndex - effectedSegment.startIndex);
            				var strAfterStartIndex = effectedSegment.segStr.substring(startIndex - effectedSegment.startIndex);

            				effectedSegment.segStr = strBeforeStartIndex + entryStr + strAfterStartIndex;
            				effectedSegment.endIndex += entryStr.length;

    			    		for (var i = (segmentLocation + 1); i < segmentsArray.length; i++) {
    					    	segmentsArray[i].startIndex += entryStr.length;
    					    	segmentsArray[i].endIndex += entryStr.length;
    			    		}

                            // new
                            _.find(that.statisticDataArray, function(eachAuthor){
                                if (eachAuthor.authorId === authorId){
                                    eachAuthor.selfEdit += entryStr.length;
                                }
                            });
                        }
					}
					else{
                        if (effectedSegment.startIndex === effectedSegment.endIndex){
                            that.currentSegID += 1;
                            var currentSeg = that.constructSegment(authorId, entryStr, that.currentSegID, that.currentSegID, 0, that.revID, startIndex, (startIndex + entryStr.length - 1), "new insert segment in the middle of a one-charactor, temporary, differentAuthor effected segment", false);
                            segmentsArray.insert(currentSeg, (segmentLocation) );

                            for (var i = (segmentLocation + 1); i < segmentsArray.length; i++) {
                                segmentsArray[i].startIndex += entryStr.length;
                                segmentsArray[i].endIndex += entryStr.length;
                            }
                            // new
                            _.find(that.statisticDataArray, function(eachAuthor){
                                if (eachAuthor.authorId === authorId){
                                    eachAuthor.otherEdit += entryStr.length;
                                }
                            });
                        }


                        else {
    	        			var strBeforeStartIndex = effectedSegment.segStr.substring(0, (startIndex - effectedSegment.startIndex));
    	        			var strAfterStartIndex = effectedSegment.segStr.substring(startIndex - effectedSegment.startIndex);

    	        			that.currentSegID += 1;
    	        			var segBefore = that.constructSegment(effectedSegment.authorId, strBeforeStartIndex, that.currentSegID, effectedSegment.parentSegID, 0, that.revID, effectedSegment.startIndex, (startIndex - 1), "from buildSegmentsWhenInsert Before when permanentFlag = false, differentAuthor", false);
    	        			segmentsArray.insert(segBefore, segmentLocation);

    					    that.currentSegID += 1;
    					    var currentSeg = that.constructSegment(authorId, entryStr, that.currentSegID, that.currentSegID, 0, that.revID, startIndex , (startIndex + entryStr.length - 1), "new insert segment in the middle of the found temporary, differentAuthor effected segment", false);
    			    		segmentsArray.insert(currentSeg, (segmentLocation + 1) );
    					    
    					    that.currentSegID += 1;
    					    var offset = startIndex - effectedSegment.startIndex;
    					    var segAfter = that.constructSegment(effectedSegment.authorId, strAfterStartIndex, that.currentSegID, effectedSegment.parentSegID, offset, that.revID, (startIndex + entryStr.length ), (effectedSegment.endIndex + entryStr.length), "from buildSegmentsWhenInsert After when permanentFlag = false, differentAuthor", false);
    	    		        segmentsArray.insert(segAfter, (segmentLocation + 2) );

    	    		        segmentsArray.delete( (segmentLocation+3), (segmentLocation+3) );

    	            		for (var i = (segmentLocation + 3); i < segmentsArray.length; i++) {
    	        		    	segmentsArray[i].startIndex += entryStr.length;
    	        		    	segmentsArray[i].endIndex += entryStr.length;
    	            		}
                            // new
                            _.find(that.statisticDataArray, function(eachAuthor){
                                if (eachAuthor.authorId === authorId){
                                    eachAuthor.otherEdit += entryStr.length;
                                }
                            });



                        }
					}
        		}

        	}
        	else{
        		// shouldn't happen
        	}
        }

        return segmentsArray;

    },


    buildSegmentsWhenDelete: function(deleteStartIndex, deleteEndIndex, authorId, segmentsArray) {
        var that = this;

        // var deleteSegmentLocation = null;
        var effectedSegmentOfDelete = null;

        // delete start === delete end, only deleting 1 character
        if (deleteStartIndex === deleteEndIndex) {

            var deleteIndex = deleteStartIndex;

            if(segmentsArray != null){

                effectedSegmentOfDelete = _.find(segmentsArray, function(eachSegment, index) {
                    if (eachSegment.startIndex === deleteIndex ) {

                    	if (eachSegment.startIndex === eachSegment.endIndex) {
                    		
                    		// delete the whole segment
                    		segmentsArray.delete(index, index);

                    		// updates all the following segments's start and end index
                    		for (var i = index; i <= (segmentsArray.length-1); i++){
                    		    segmentsArray[i].startIndex -= 1;
                    		    segmentsArray[i].endIndex -= 1;
                    		}

                            // new
                            if (eachSegment.authorId === authorId){
                                _.find(that.statisticDataArray, function(eachAuthor){
                                    if (eachAuthor.authorId === authorId){
                                        eachAuthor.selfEdit += 1;
                                    }
                                });   
                            }
                            else{
                                _.find(that.statisticDataArray, function(eachAuthor){
                                    if (eachAuthor.authorId === authorId){
                                        eachAuthor.otherEdit += 1;
                                    }
                                });   
                            }


                    		// deleteSegmentLocation = index;
                    		return eachSegment;
                    	}
                    	else {

                    		var strAfterDelete = eachSegment.segStr.substring(1); // = substring(1)

                    		if (eachSegment.permanentFlag === true) {
	                    		

	                    		// create a new segment with offset
	                    		that.currentSegID += 1;
	                    		var segAfter  = that.constructSegment(eachSegment.authorId, strAfterDelete, that.currentSegID, eachSegment.segID, 1, that.revID, eachSegment.startIndex, (eachSegment.endIndex - 1), " segAfter when eleteStartIndex === deleteEndIndex, permanentflag = true", false);
	                    		segmentsArray.insert(segAfter, index);

	                    		// delete the whole segment
	                    		segmentsArray.delete((index + 1), (index + 1));

	                    		// updates all the following segments's start and end index
	                    		for (var i = (index+1); i <= (segmentsArray.length-1); i++){
	                    		    segmentsArray[i].startIndex -= 1;
	                    		    segmentsArray[i].endIndex -= 1;
	                    		}


                                // new
                                if (eachSegment.authorId === authorId){
                                    _.find(that.statisticDataArray, function(eachAuthor){
                                        if (eachAuthor.authorId === authorId){
                                            eachAuthor.selfEdit += 1;
                                        }
                                    });   
                                }
                                else{
                                    _.find(that.statisticDataArray, function(eachAuthor){
                                        if (eachAuthor.authorId === authorId){
                                            eachAuthor.otherEdit += 1;
                                        }
                                    });   
                                }

	                    		return eachSegment;

                    		}
                    		else {
                    			// segmentsArray[index].segStr = strAfterDelete;
                    			// segmentsArray[index].endIndex -= 1;

                                // create a new segment with offset
                                that.currentSegID += 1;
                                var segAfter  = that.constructSegment(eachSegment.authorId, strAfterDelete, that.currentSegID, eachSegment.parentSegID, 1, that.revID, eachSegment.startIndex, (eachSegment.endIndex - 1), " segAfter when eleteStartIndex === deleteEndIndex, permanentflag = true", false);
                                segmentsArray.insert(segAfter, index);

                                // delete the whole segment
                                segmentsArray.delete((index + 1), (index + 1));

                                // updates all the following segments's start and end index
                                for (var i = (index+1); i <= (segmentsArray.length-1); i++){
                                    segmentsArray[i].startIndex -= 1;
                                    segmentsArray[i].endIndex -= 1;
                                }


                                // new
                                if (eachSegment.authorId === authorId){
                                    _.find(that.statisticDataArray, function(eachAuthor){
                                        if (eachAuthor.authorId === authorId){
                                            eachAuthor.selfEdit += 1;
                                        }
                                    });   
                                }
                                else{
                                    _.find(that.statisticDataArray, function(eachAuthor){
                                        if (eachAuthor.authorId === authorId){
                                            eachAuthor.otherEdit += 1;
                                        }
                                    });   
                                }
                    			return eachSegment;
                    		}

                    	}
                    	
                    }
                    else if (eachSegment.endIndex === deleteIndex ){
                    	if (eachSegment.startIndex === eachSegment.endIndex) {
                    		

                    		// updates all the following segments's start and end index
                    		for (var i = index; i <= (segmentsArray.length-1); i++){
                    		    segmentsArray[i].startIndex -= 1;
                    		    segmentsArray[i].endIndex -= 1;
                    		}

                    		// delete the whole segment
                    		segmentsArray.delete( (index + 1 ), (index+1));


                            // new
                            if (eachSegment.authorId === authorId){
                                _.find(that.statisticDataArray, function(eachAuthor){
                                    if (eachAuthor.authorId === authorId){
                                        eachAuthor.selfEdit += 1;
                                    }
                                });   
                            }
                            else{
                                _.find(that.statisticDataArray, function(eachAuthor){
                                    if (eachAuthor.authorId === authorId){
                                        eachAuthor.otherEdit += 1;
                                    }
                                });   
                            }

                    		return eachSegment;
                    		
                    	}
                    	else{
                    		var strBeforeDelete = eachSegment.segStr.substring(0, (deleteIndex - eachSegment.startIndex)); // = substring(0,end-1)

                    		if (eachSegment.permanentFlag === true) {
	                    		

	                    		// create a new segment with offset
	                    		that.currentSegID += 1;
	                    		var segBefore  = that.constructSegment(eachSegment.authorId, strBeforeDelete, that.currentSegID, eachSegment.segID, 0, that.revID, eachSegment.startIndex, (eachSegment.endIndex - 1), " segBefore when eleteStartIndex === deleteEndIndex, in eachSegment.startIndex != eachSegment.endIndex, permanentflag = true", false);
	                    		segmentsArray.insert(segBefore, index);

	                    		// delete the whole segment
	                    		segmentsArray.delete( (index + 1 ), (index+1));

	                    		// updates all the following segments's start and end index
	                    		for (var i = (index+1); i <= (segmentsArray.length-1); i++){
	                    		    segmentsArray[i].startIndex -= 1;
	                    		    segmentsArray[i].endIndex -= 1;
	                    		}


                                // new
                                if (eachSegment.authorId === authorId){
                                    _.find(that.statisticDataArray, function(eachAuthor){
                                        if (eachAuthor.authorId === authorId){
                                            eachAuthor.selfEdit += 1;
                                        }
                                    });   
                                }
                                else{
                                    _.find(that.statisticDataArray, function(eachAuthor){
                                        if (eachAuthor.authorId === authorId){
                                            eachAuthor.otherEdit += 1;
                                        }
                                    });   
                                }


	                    		return eachSegment;
                    		}
                    		else {


                    			// segmentsArray[index].segStr = strBeforeDelete;
                    			// segmentsArray[index].endIndex -= 1;

                                // create a new segment with offset
                                that.currentSegID += 1;
                                var segBefore  = that.constructSegment(eachSegment.authorId, strBeforeDelete, that.currentSegID, eachSegment.parentSegID, 0, that.revID, eachSegment.startIndex, (eachSegment.endIndex - 1), " segBefore when eleteStartIndex === deleteEndIndex, in eachSegment.startIndex != eachSegment.endIndex, permanentflag = true", false);
                                segmentsArray.insert(segBefore, index);

                                // delete the whole segment
                                segmentsArray.delete( (index + 1 ), (index+1));

                    			// updates all the following segments's start and end index
                    			for (var i = (index+1); i <= (segmentsArray.length-1); i++){
                    			    segmentsArray[i].startIndex -= 1;
                    			    segmentsArray[i].endIndex -= 1;
                    			}


                                // new
                                if (eachSegment.authorId === authorId){
                                    _.find(that.statisticDataArray, function(eachAuthor){
                                        if (eachAuthor.authorId === authorId){
                                            eachAuthor.selfEdit += 1;
                                        }
                                    });   
                                }
                                else{
                                    _.find(that.statisticDataArray, function(eachAuthor){
                                        if (eachAuthor.authorId === authorId){
                                            eachAuthor.otherEdit += 1;
                                        }
                                    });   
                                }

                    			return eachSegment;
                    		}

                    	}
                    	
                    }
                    else if (eachSegment.startIndex < deleteIndex && deleteIndex < eachSegment.endIndex){
                		var strBeforeDelete = eachSegment.segStr.substring(0, (deleteIndex - eachSegment.startIndex)); // = substring(0,end-1)
                		var strAfterDelete = eachSegment.segStr.substring(deleteIndex - eachSegment.startIndex + 1); //

                		if (eachSegment.permanentFlag === true) {

                    		// create two new segments, one with offset 0, another with offeset 
                    		that.currentSegID += 1;
                    		var segBefore  = that.constructSegment(eachSegment.authorId, strBeforeDelete, that.currentSegID, eachSegment.segID, 0, that.revID, eachSegment.startIndex, (deleteIndex - 1), "segBefore when eachSegment.startIndex === eachSegment.endIndex, in (eachSegment.startIndex < deleteIndex && deleteIndex < eachSegment.endIndex), permanentflag = true", false);
                    		segmentsArray.insert(segBefore, index);

                    		// create a new segment with offset
                    		that.currentSegID += 1;
                    		var segAfter  = that.constructSegment(eachSegment.authorId, strAfterDelete, that.currentSegID, eachSegment.segID, (deleteIndex - eachSegment.startIndex + 1 ), that.revID, deleteIndex, (eachSegment.endIndex - 1), "segAffter when when eachSegment.startIndex === eachSegment.endIndex, in (eachSegment.startIndex < deleteIndex && deleteIndex < eachSegment.endIndex), permanentflag = true", false);
                    		segmentsArray.insert(segAfter, (index+1) );

                    		// delete the whole segment
                    		segmentsArray.delete( (index + 2 ), (index+2));

                    		// updates all the following segments
                    		for (var i = (index+2); i <= (segmentsArray.length-1); i++){
                    		    segmentsArray[i].startIndex -= 1;
                    		    segmentsArray[i].endIndex -= 1;
                    		}


                            // new
                            if (eachSegment.authorId === authorId){
                                _.find(that.statisticDataArray, function(eachAuthor){
                                    if (eachAuthor.authorId === authorId){
                                        eachAuthor.selfEdit += 1;
                                    }
                                });   
                            }
                            else{
                                _.find(that.statisticDataArray, function(eachAuthor){
                                    if (eachAuthor.authorId === authorId){
                                        eachAuthor.otherEdit += 1;
                                    }
                                });   
                            }

                    		return eachSegment;

                		}
                		else {
                			// segmentsArray[index].segStr = strBeforeDelete + strAfterDelete;
                			// segmentsArray[index].endIndex -= 1;

                			// // updates all the following segments
                			// for (var i = (index+1); i <= (segmentsArray.length-1); i++){
                			//     segmentsArray[i].startIndex -= 1;
                			//     segmentsArray[i].endIndex -= 1;
                			// }
                			// return eachSegment;
                            // create two new segments, one with offset 0, another with offeset 
                            that.currentSegID += 1;
                            var segBefore  = that.constructSegment(eachSegment.authorId, strBeforeDelete, that.currentSegID, eachSegment.parentSegID, 0, that.revID, eachSegment.startIndex, (deleteIndex - 1), "segBefore when eachSegment.startIndex === eachSegment.endIndex, in (eachSegment.startIndex < deleteIndex && deleteIndex < eachSegment.endIndex), permanentflag = true", false);
                            segmentsArray.insert(segBefore, index);

                            // create a new segment with offset
                            that.currentSegID += 1;
                            var segAfter  = that.constructSegment(eachSegment.authorId, strAfterDelete, that.currentSegID, eachSegment.parentSegID, (deleteIndex - eachSegment.startIndex + 1 ), that.revID, deleteIndex, (eachSegment.endIndex - 1), "segAffter when when eachSegment.startIndex === eachSegment.endIndex, in (eachSegment.startIndex < deleteIndex && deleteIndex < eachSegment.endIndex), permanentflag = true", false);
                            segmentsArray.insert(segAfter, (index+1) );

                            // delete the whole segment
                            segmentsArray.delete( (index + 2 ), (index+2));

                            // updates all the following segments
                            for (var i = (index+2); i <= (segmentsArray.length-1); i++){
                                segmentsArray[i].startIndex -= 1;
                                segmentsArray[i].endIndex -= 1;
                            }


                            // new
                            if (eachSegment.authorId === authorId){
                                _.find(that.statisticDataArray, function(eachAuthor){
                                    if (eachAuthor.authorId === authorId){
                                        eachAuthor.selfEdit += 1;
                                    }
                                });   
                            }
                            else{
                                _.find(that.statisticDataArray, function(eachAuthor){
                                    if (eachAuthor.authorId === authorId){
                                        eachAuthor.otherEdit += 1;
                                    }
                                });   
                            }

                            return eachSegment;
                		}

                    }
                    else {
                        // do nothing, keep looking
                    }

                });
            }
            else{
                console.log("This should never happen, segmentsArray is null,  buildSegmentsWhenDelete when deleteStartIndex === deleteEndIndex");
            }
        }
        else { // when deleteStartIndex != deleteEndIndex

        	var deleteStartSegmentLocation = null;
        	var effectedSegmentOfDeleteStart = null;
        	var deleteEndSegmentLocation = null;
        	var effectedSegmentOfDeleteEnd = null;

        	if(segmentsArray != null ){

        		effectedSegmentOfDeleteStart = _.find(segmentsArray, function(eachSegment, index) {
        		    if (eachSegment.startIndex <= deleteStartIndex && deleteStartIndex <= eachSegment.endIndex) {
        		        deleteStartSegmentLocation = index;
        		        return eachSegment;
        		    }
        		    else {
        		        // do nothing, keep looking
        		    }
        		});

        		if (effectedSegmentOfDeleteStart === undefined){
        			console.log(deleteStartIndex);
        			console.log(segmentsArray);
        			console.log("error 1");

        		}


        		effectedSegmentOfDeleteEnd = _.find(segmentsArray, function(eachSegment, index) {
        		    if (eachSegment.startIndex <= deleteEndIndex && deleteEndIndex <= eachSegment.endIndex) {
        		        deleteEndSegmentLocation = index;
        		        return eachSegment;
        		    }
        		        
        		    else {
        		        // do nothing, keep looking
        		    }
        		});

        		if (effectedSegmentOfDeleteEnd === undefined ){
        			console.log(deleteStartIndex);
                    console.log(deleteEndIndex);
                    console.log(segmentsArray);
        			console.log("BUG 1, because of the footnote insert and delete");

        			deleteEndSegmentLocation = segmentsArray.length-1;
        			effectedSegmentOfDeleteEnd = segmentsArray[segmentsArray.length-1];
        			deleteEndIndex = effectedSegmentOfDeleteEnd.endIndex;
        		}

        		// delete within the same segment
        		if (deleteStartSegmentLocation === deleteEndSegmentLocation) {

                    // new
                    if (effectedSegmentOfDeleteStart.authorId === authorId){
                        _.find(that.statisticDataArray, function(eachAuthor){
                            if (eachAuthor.authorId === authorId){ 
                                eachAuthor.selfEdit +=  deleteEndIndex - deleteStartIndex + 1;
                            }
                        });      
                    }
                    else{
                        _.find(that.statisticDataArray, function(eachAuthor){
                            if (eachAuthor.authorId === authorId){ 
                                eachAuthor.otherEdit +=  deleteEndIndex - deleteStartIndex + 1;
                            }
                        });   
                    }



        			if(deleteStartIndex > effectedSegmentOfDeleteStart.startIndex && deleteEndIndex < effectedSegmentOfDeleteStart.endIndex){
						var strBeforeDelete = effectedSegmentOfDeleteStart.segStr.substring(0, (deleteStartIndex - effectedSegmentOfDeleteStart.startIndex)); // = substring(0,end-1)
						var strAfterDelete = effectedSegmentOfDeleteStart.segStr.substring(deleteEndIndex - effectedSegmentOfDeleteStart.startIndex + 1 ); 

						if (effectedSegmentOfDeleteStart.permanentFlag === true) {
				    		

				    		// create two new segments, one with offset 0, another with offeset 
				    		that.currentSegID += 1;
				    		var segBefore  = that.constructSegment(effectedSegmentOfDeleteStart.authorId, strBeforeDelete, that.currentSegID, effectedSegmentOfDeleteStart.segID, 0, that.revID, effectedSegmentOfDeleteStart.startIndex, (deleteStartIndex - 1), "segBefore of delete in the middle within a segment when permanentFlag is true", false);
				    		segmentsArray.insert(segBefore, deleteStartSegmentLocation);

				    		// seg after
				    		that.currentSegID += 1;
				    		var segAfter  = that.constructSegment(effectedSegmentOfDeleteStart.authorId, strAfterDelete, that.currentSegID, effectedSegmentOfDeleteStart.segID, (deleteEndIndex - effectedSegmentOfDeleteStart.startIndex + 1 ), that.revID, deleteStartIndex, (effectedSegmentOfDeleteStart.endIndex - 1 - deleteEndIndex + deleteStartIndex), "segAfter of delete in the middle within a segment when permanentFlag is true", false);
				    		segmentsArray.insert(segAfter, (deleteStartSegmentLocation+1) );

				    		// delete the old segment from current revision
				    		segmentsArray.delete( (deleteStartSegmentLocation + 2), (deleteStartSegmentLocation+2));

				    		// updates all the following segments
				    		for (var i = (deleteStartSegmentLocation+2); i <= (segmentsArray.length-1); i++){
				    		    segmentsArray[i].startIndex -= (deleteEndIndex - deleteStartIndex + 1 );
				    		    segmentsArray[i].endIndex -= (deleteEndIndex - deleteStartIndex + 1 );
				    		}


						}
						else {
							// segmentsArray[deleteStartSegmentLocation].segStr = strBeforeDelete + strAfterDelete;
							// segmentsArray[deleteStartSegmentLocation].endIndex -= (deleteEndIndex - deleteStartIndex + 1 );

							// // updates all the following segments
							// for (var i = (deleteStartSegmentLocation+1); i <= (segmentsArray.length-1); i++){
							//     segmentsArray[i].startIndex -= (deleteEndIndex - deleteStartIndex + 1 );
							//     segmentsArray[i].endIndex -= (deleteEndIndex - deleteStartIndex + 1 );
							// }
                            // create two new segments, one with offset 0, another with offeset 
                            that.currentSegID += 1;
                            var segBefore  = that.constructSegment(effectedSegmentOfDeleteStart.authorId, strBeforeDelete, that.currentSegID, effectedSegmentOfDeleteStart.parentSegID, 0, that.revID, effectedSegmentOfDeleteStart.startIndex, (deleteStartIndex - 1), "segBefore of delete in the middle within a segment when permanentFlag is true", false);
                            segmentsArray.insert(segBefore, deleteStartSegmentLocation);

                            // seg after
                            that.currentSegID += 1;
                            var segAfter  = that.constructSegment(effectedSegmentOfDeleteStart.authorId, strAfterDelete, that.currentSegID, effectedSegmentOfDeleteStart.parentSegID, (deleteEndIndex - effectedSegmentOfDeleteStart.startIndex + 1 ), that.revID, deleteStartIndex, (effectedSegmentOfDeleteStart.endIndex - 1 - deleteEndIndex + deleteStartIndex), "segAfter of delete in the middle within a segment when permanentFlag is true", false);
                            segmentsArray.insert(segAfter, (deleteStartSegmentLocation+1) );

                            // delete the old segment from current revision
                            segmentsArray.delete( (deleteStartSegmentLocation + 2), (deleteStartSegmentLocation+2));

                            // updates all the following segments
                            for (var i = (deleteStartSegmentLocation+2); i <= (segmentsArray.length-1); i++){
                                segmentsArray[i].startIndex -= (deleteEndIndex - deleteStartIndex + 1 );
                                segmentsArray[i].endIndex -= (deleteEndIndex - deleteStartIndex + 1 );
                            }

						}
        			}
        			else if (deleteStartIndex === effectedSegmentOfDeleteStart.startIndex && deleteEndIndex < effectedSegmentOfDeleteStart.endIndex){
						var strAfterDelete = effectedSegmentOfDeleteStart.segStr.substring(deleteEndIndex - effectedSegmentOfDeleteStart.startIndex + 1 ); 

						if (effectedSegmentOfDeleteStart.permanentFlag === true) {

				    		// create a new segment with offset
				    		that.currentSegID += 1;

                            var segAfter  = that.constructSegment(effectedSegmentOfDeleteStart.authorId, strAfterDelete, that.currentSegID, effectedSegmentOfDeleteStart.segID, (deleteEndIndex - effectedSegmentOfDeleteStart.startIndex + 1 ), that.revID, deleteStartIndex, (effectedSegmentOfDeleteStart.endIndex - 1 - deleteEndIndex + deleteStartIndex), "segAfter of delete from start to somewhere in the middle within a segment when permanentFlag is true", false);                               
                          
				    		segmentsArray.insert(segAfter, (deleteStartSegmentLocation) );

				    		// delete the whole segment
				    		segmentsArray.delete( (deleteStartSegmentLocation + 1 ), (deleteStartSegmentLocation+1));

				    		// updates all the following segments
				    		for (var i = (deleteStartSegmentLocation+1); i <= (segmentsArray.length-1); i++){
				    		    segmentsArray[i].startIndex -= (deleteEndIndex - deleteStartIndex + 1 );
				    		    segmentsArray[i].endIndex -= (deleteEndIndex - deleteStartIndex + 1 );
				    		}


						}
						else {
							// segmentsArray[deleteStartSegmentLocation].segStr = strAfterDelete;
							// segmentsArray[deleteStartSegmentLocation].endIndex -= (deleteEndIndex - deleteStartIndex + 1 );

							// // updates all the following segments
							// for (var i = (deleteStartSegmentLocation+1); i <= (segmentsArray.length-1); i++){
							//     segmentsArray[i].startIndex -= (deleteEndIndex - deleteStartIndex + 1 );
							//     segmentsArray[i].endIndex -= (deleteEndIndex - deleteStartIndex + 1 );
							// }

                            // create a new segment with offset
                            that.currentSegID += 1;

                            var segAfter  = that.constructSegment(effectedSegmentOfDeleteStart.authorId, strAfterDelete, that.currentSegID, effectedSegmentOfDeleteStart.parentSegID, (deleteEndIndex - effectedSegmentOfDeleteStart.startIndex + 1 ), that.revID, deleteStartIndex, (effectedSegmentOfDeleteStart.endIndex - 1 - deleteEndIndex + deleteStartIndex), "segAfter of delete from start to somewhere in the middle within a segment when permanentFlag is true", false);                               
                          
                            segmentsArray.insert(segAfter, (deleteStartSegmentLocation) );

                            // delete the whole segment
                            segmentsArray.delete( (deleteStartSegmentLocation + 1 ), (deleteStartSegmentLocation+1));

                            // updates all the following segments
                            for (var i = (deleteStartSegmentLocation+1); i <= (segmentsArray.length-1); i++){
                                segmentsArray[i].startIndex -= (deleteEndIndex - deleteStartIndex + 1 );
                                segmentsArray[i].endIndex -= (deleteEndIndex - deleteStartIndex + 1 );
                            }

						}
        			}
        			else if(deleteStartIndex > effectedSegmentOfDeleteStart.startIndex && deleteEndIndex === effectedSegmentOfDeleteStart.endIndex){

						var strBeforeDelete = effectedSegmentOfDeleteStart.segStr.substring(0, (deleteStartIndex - effectedSegmentOfDeleteStart.startIndex)); // = substring(0,end-1)
						
						if (effectedSegmentOfDeleteStart.permanentFlag === true) {
				    		

				    		// create two new segments, one with offset 0, another with offeset 
				    		that.currentSegID += 1;

                            var segBefore  = that.constructSegment(effectedSegmentOfDeleteStart.authorId, strBeforeDelete, that.currentSegID, effectedSegmentOfDeleteStart.segID, 0, that.revID, effectedSegmentOfDeleteStart.startIndex, (deleteStartIndex - 1), "segBefore of delete from middle to the end within a segment when permanentFlag is true", false);

				    		segmentsArray.insert(segBefore, deleteStartSegmentLocation);
				    		
				    		// delete the old segment from current revision
				    		segmentsArray.delete( (deleteStartSegmentLocation+1), (deleteStartSegmentLocation + 1 ));


				    		// updates all the following segments
				    		for (var i = (deleteStartSegmentLocation+1); i <= (segmentsArray.length-1); i++){
				    		    segmentsArray[i].startIndex -= (deleteEndIndex - deleteStartIndex + 1 );
				    		    segmentsArray[i].endIndex -= (deleteEndIndex - deleteStartIndex + 1 );
				    		}


						}
						else {
							// segmentsArray[deleteStartSegmentLocation].segStr = strBeforeDelete;
							// segmentsArray[deleteStartSegmentLocation].endIndex -= (deleteEndIndex - deleteStartIndex + 1 );

							// // updates all the following segments
							// for (var i = (deleteStartSegmentLocation+1); i <= (segmentsArray.length-1); i++){
							//     segmentsArray[i].startIndex -= (deleteEndIndex - deleteStartIndex + 1 );
							//     segmentsArray[i].endIndex -= (deleteEndIndex - deleteStartIndex + 1 );
							// }
                            // create two new segments, one with offset 0, another with offeset 
                            that.currentSegID += 1;

                            var segBefore  = that.constructSegment(effectedSegmentOfDeleteStart.authorId, strBeforeDelete, that.currentSegID, effectedSegmentOfDeleteStart.segID, 0, that.revID, effectedSegmentOfDeleteStart.startIndex, (deleteStartIndex - 1), "segBefore of delete from middle to the end within a segment when permanentFlag is true", false);

                            segmentsArray.insert(segBefore, deleteStartSegmentLocation);
                            
                            // delete the old segment from current revision
                            segmentsArray.delete( (deleteStartSegmentLocation+1), (deleteStartSegmentLocation + 1 ));


                            // updates all the following segments
                            for (var i = (deleteStartSegmentLocation+1); i <= (segmentsArray.length-1); i++){
                                segmentsArray[i].startIndex -= (deleteEndIndex - deleteStartIndex + 1 );
                                segmentsArray[i].endIndex -= (deleteEndIndex - deleteStartIndex + 1 );
                            }


						}
        			}
        			else if (deleteStartIndex === effectedSegmentOfDeleteStart.startIndex && deleteEndIndex === effectedSegmentOfDeleteStart.endIndex){
        				segmentsArray.delete(deleteStartSegmentLocation, deleteStartSegmentLocation);
        				// updates all the following segments
        				for (var i = deleteStartSegmentLocation; i <= (segmentsArray.length-1); i++){
        				    segmentsArray[i].startIndex -= (deleteEndIndex - deleteStartIndex + 1 );
        				    segmentsArray[i].endIndex -= (deleteEndIndex - deleteStartIndex + 1 );
        				}

        			}
        			else {
        				console.log("shouldn't happen in buildSegmentsWhenDelete, deleteStartSegmentLocation === deleteEndSegmentLocation");
        			}

        		}
        		// not within one segment, across multiple segments
        		else {
                    // new
                    
                    var selfEditCount = 0;
                    var otherEditCount = 0;

                    for (var i = deleteStartSegmentLocation+1; i<= deleteEndSegmentLocation-1; i++){
                        if (segmentsArray[i].authorId === authorId){
                            selfEditCount += segmentsArray[i].endIndex - segmentsArray[i].startIndex + 1;
                        }
                        else{
                            otherEditCount += segmentsArray[i].endIndex - segmentsArray[i].startIndex + 1;
                        }
                    }


                    if (effectedSegmentOfDeleteStart.authorId === authorId){
                        _.find(that.statisticDataArray, function(eachAuthor){
                            if (eachAuthor.authorId === authorId){ 
                                eachAuthor.selfEdit += selfEditCount + effectedSegmentOfDeleteStart.endIndex - deleteStartIndex + 1;
                                eachAuthor.otherEdit += otherEditCount;
                            }
                        });      
                    }
                    else{
                        _.find(that.statisticDataArray, function(eachAuthor){
                            if (eachAuthor.authorId === authorId){ 
                                eachAuthor.selfEdit +=  effectedSegmentOfDeleteStart.endIndex - deleteStartIndex + 1;
                                eachAuthor.otherEdit += otherEditCount + effectedSegmentOfDeleteStart.endIndex - deleteStartIndex + 1;
                            }
                        });   
                    }

                    if (effectedSegmentOfDeleteEnd.authorId === authorId){
                        _.find(that.statisticDataArray, function(eachAuthor){
                            if (eachAuthor.authorId === authorId){ 
                                eachAuthor.selfEdit += deleteEndIndex - effectedSegmentOfDeleteEnd.startIndex + 1;
                                //eachAuthor.otherEdit += otherEditCount;
                            }
                        });   
                    }
                    else{
                        _.find(that.statisticDataArray, function(eachAuthor){
                            if (eachAuthor.authorId === authorId){ 
                                //eachAuthor.selfEdit += deleteEndIndex - effectedSegmentOfDeleteEnd.startIndex + 1;
                                eachAuthor.otherEdit +=  deleteEndIndex - effectedSegmentOfDeleteEnd.startIndex + 1;
                            }
                        });   
                    }


					if(deleteStartIndex > effectedSegmentOfDeleteStart.startIndex && deleteEndIndex < effectedSegmentOfDeleteEnd.endIndex){
						var strBeforeDelete = effectedSegmentOfDeleteStart.segStr.substring(0, (deleteStartIndex - effectedSegmentOfDeleteStart.startIndex)); // = substring(0,end-1)
						var strAfterDelete = effectedSegmentOfDeleteEnd.segStr.substring(deleteEndIndex - effectedSegmentOfDeleteEnd.startIndex + 1); 

						if (effectedSegmentOfDeleteStart.permanentFlag === true) {
				    		

				    		// create a new segment, one with offset 0, another with offeset 
				    		that.currentSegID += 1;
  
				    		var segBefore  = that.constructSegment(effectedSegmentOfDeleteStart.authorId, strBeforeDelete, that.currentSegID, effectedSegmentOfDeleteStart.segID, 0, that.revID, effectedSegmentOfDeleteStart.startIndex, (deleteStartIndex - 1), "segBefore of delete in the middle across many segments when permanentFlag is true", false);
                            
				    		segmentsArray.insert(segBefore, deleteStartSegmentLocation);
				    		// delete the old segment from current revision
				    		segmentsArray.delete((deleteStartSegmentLocation + 1), (deleteStartSegmentLocation + 1));

						}
						else {
							// segmentsArray[deleteStartSegmentLocation].segStr = strBeforeDelete;
							// segmentsArray[deleteStartSegmentLocation].endIndex = (deleteStartIndex -1 );

                            // create a new segment, one with offset 0, another with offeset 
                            that.currentSegID += 1;
                            
                            var segBefore  = that.constructSegment(effectedSegmentOfDeleteStart.authorId, strBeforeDelete, that.currentSegID, effectedSegmentOfDeleteStart.parentSegID, 0, that.revID, effectedSegmentOfDeleteStart.startIndex, (deleteStartIndex - 1), "segBefore of delete in the middle across many segments when permanentFlag is true", false);
                                              
                            segmentsArray.insert(segBefore, deleteStartSegmentLocation);
                            // delete the old segment from current revision
                            segmentsArray.delete((deleteStartSegmentLocation + 1), (deleteStartSegmentLocation + 1));


						}

						if (effectedSegmentOfDeleteEnd.permanentFlag === true) {
							

				    		// create a new segment with offset
				    		that.currentSegID += 1;

				    		var segAfter  = that.constructSegment(effectedSegmentOfDeleteEnd.authorId, strAfterDelete, that.currentSegID, effectedSegmentOfDeleteEnd.segID, (deleteEndIndex - effectedSegmentOfDeleteEnd.startIndex + 1), that.revID, deleteStartIndex, (effectedSegmentOfDeleteEnd.endIndex - 1 - deleteEndIndex + deleteStartIndex), "segAfter of delete from the beginning of a segment to the middle of any segment across when permanentFlag is true", false);
                            
				    		segmentsArray.insert(segAfter, deleteEndSegmentLocation );
				    		// delete the old segment from current revision
				    		segmentsArray.delete( (deleteEndSegmentLocation + 1), (deleteEndSegmentLocation+ 1 ));

						}
						else {
							// segmentsArray[deleteEndSegmentLocation].segStr = strAfterDelete;
							// segmentsArray[deleteEndSegmentLocation].startIndex = deleteStartIndex;
							// segmentsArray[deleteEndSegmentLocation].endIndex = (effectedSegmentOfDeleteEnd.endIndex - 1 - deleteEndIndex + deleteStartIndex);

                            // create a new segment with offset
                            that.currentSegID += 1;
                            var segAfter  = that.constructSegment(effectedSegmentOfDeleteEnd.authorId, strAfterDelete, that.currentSegID, effectedSegmentOfDeleteEnd.parentSegID, (deleteEndIndex - effectedSegmentOfDeleteEnd.startIndex + 1), that.revID, deleteStartIndex, (effectedSegmentOfDeleteEnd.endIndex - 1 - deleteEndIndex + deleteStartIndex), "segAfter of delete from the beginning of a segment to the middle of any segment across when permanentFlag is true", false);
                                              
                            segmentsArray.insert(segAfter, deleteEndSegmentLocation );
                            // delete the old segment from current revision
                            segmentsArray.delete( (deleteEndSegmentLocation + 1), (deleteEndSegmentLocation+ 1 ));
						}

						// updates all the following segments
						for (var i = (deleteEndSegmentLocation+1); i <= (segmentsArray.length-1); i++){
						    segmentsArray[i].startIndex -= (deleteEndIndex - deleteStartIndex + 1 );
						    segmentsArray[i].endIndex -= (deleteEndIndex - deleteStartIndex + 1 );
						}

						if (deleteEndSegmentLocation === (deleteStartSegmentLocation+1)){

						}
						else{
							segmentsArray.delete( (deleteStartSegmentLocation+1), (deleteEndSegmentLocation-1));
						}
					}

					else if (deleteStartIndex === effectedSegmentOfDeleteStart.startIndex && deleteEndIndex < effectedSegmentOfDeleteEnd.endIndex){

						// segmentsArray.delete(deleteStartSegmentLocation, deleteStartSegmentLocation);

						//var strBeforeDelete = effectedSegmentOfDeleteStart.segStr.substring(0, (deleteStartIndex - effectedSegmentOfDeleteStart.startIndex)); // = substring(0,end-1)

						var strAfterDelete = effectedSegmentOfDeleteEnd.segStr.substring(deleteEndIndex - effectedSegmentOfDeleteEnd.startIndex + 1 );

						if (effectedSegmentOfDeleteEnd.permanentFlag === true) {
							
				    		// create a new segment with offset
				    		that.currentSegID += 1;

                            var segAfter  = that.constructSegment(effectedSegmentOfDeleteEnd.authorId, strAfterDelete, that.currentSegID, effectedSegmentOfDeleteEnd.segID, (deleteEndIndex - effectedSegmentOfDeleteEnd.startIndex + 1), that.revID, deleteStartIndex, (effectedSegmentOfDeleteEnd.endIndex - 1 - deleteEndIndex + deleteStartIndex), "segAfter of delete from the beginning of a segment to the middle of any segment across when permanentFlag is true", false);

				    		segmentsArray.insert(segAfter, deleteEndSegmentLocation );
				    		// delete the old segment from current revision
				    		segmentsArray.delete( (deleteEndSegmentLocation + 1), (deleteEndSegmentLocation + 1 ));


						}
						else {
							// segmentsArray[deleteEndSegmentLocation].segStr = strAfterDelete;
							// segmentsArray[deleteEndSegmentLocation].startIndex = deleteStartIndex;
							// segmentsArray[deleteEndSegmentLocation].endIndex = (effectedSegmentOfDeleteEnd.endIndex - 1 - deleteEndIndex + deleteStartIndex);

                            // create a new segment with offset
                            that.currentSegID += 1;

                            var segAfter  = that.constructSegment(effectedSegmentOfDeleteEnd.authorId, strAfterDelete, that.currentSegID, effectedSegmentOfDeleteEnd.parentSegID, (deleteEndIndex - effectedSegmentOfDeleteEnd.startIndex + 1), that.revID, deleteStartIndex, (effectedSegmentOfDeleteEnd.endIndex - 1 - deleteEndIndex + deleteStartIndex), "segAfter of delete from the beginning of a segment to the middle of any segment across when permanentFlag is true", false);

                            segmentsArray.insert(segAfter, deleteEndSegmentLocation );
                            // delete the old segment from current revision
                            segmentsArray.delete( (deleteEndSegmentLocation + 1), (deleteEndSegmentLocation + 1 ));

						}

						// updates all the following segments
						for (var i = (deleteEndSegmentLocation+1); i <= (segmentsArray.length-1); i++){
						    segmentsArray[i].startIndex -= (deleteEndIndex - deleteStartIndex + 1 );
						    segmentsArray[i].endIndex -= (deleteEndIndex - deleteStartIndex + 1 );
						}

						segmentsArray.delete( deleteStartSegmentLocation, (deleteEndSegmentLocation-1));
						
					}
					else if (deleteStartIndex > effectedSegmentOfDeleteStart.startIndex && deleteEndIndex === effectedSegmentOfDeleteEnd.endIndex){
						var strBeforeDelete = effectedSegmentOfDeleteStart.segStr.substring(0, (deleteStartIndex - effectedSegmentOfDeleteStart.startIndex)); // = substring(0,end-1)
						//var strAfterDelete = effectedSegmentOfDeleteEnd.segStr.substring(deleteEndIndex - effectedSegmentOfDeleteEnd.startIndex + 1); 


						if (effectedSegmentOfDeleteStart.permanentFlag === true) {
				    		

				    		// create a new segment, one with offset 0, another with offeset 
				    		that.currentSegID += 1;

                            var segBefore  = that.constructSegment(effectedSegmentOfDeleteStart.authorId, strBeforeDelete, that.currentSegID, effectedSegmentOfDeleteStart.segID, 0, that.revID, effectedSegmentOfDeleteStart.startIndex, (deleteStartIndex - 1), "segBefore of delete from middle of a segment to the end of any segment across when permanentFlag is true", false);
                            
				    		segmentsArray.insert(segBefore, deleteStartSegmentLocation);
				    		// delete the old segment from current revision
				    		segmentsArray.delete( (deleteStartSegmentLocation + 1), (deleteStartSegmentLocation + 1));

						}
						else {
							// segmentsArray[deleteStartSegmentLocation].segStr = strBeforeDelete;
							// segmentsArray[deleteStartSegmentLocation].endIndex = (deleteStartIndex -1 );

                            // create a new segment, one with offset 0, another with offeset 
                            that.currentSegID += 1;

                            var segBefore  = that.constructSegment(effectedSegmentOfDeleteStart.authorId, strBeforeDelete, that.currentSegID, effectedSegmentOfDeleteStart.parentSegID, 0, that.revID, effectedSegmentOfDeleteStart.startIndex, (deleteStartIndex - 1), "segBefore of delete from middle of a segment to the end of any segment across when permanentFlag is true", false);
                            
                            segmentsArray.insert(segBefore, deleteStartSegmentLocation);
                            // delete the old segment from current revision
                            segmentsArray.delete( (deleteStartSegmentLocation + 1), (deleteStartSegmentLocation + 1));


						}

						// updates all the following segments
						for (var i = (deleteEndSegmentLocation+1); i <= (segmentsArray.length-1); i++){
						    segmentsArray[i].startIndex -= (deleteEndIndex - deleteStartIndex + 1 );
						    segmentsArray[i].endIndex -= (deleteEndIndex - deleteStartIndex + 1 );
						}

						segmentsArray.delete((deleteStartSegmentLocation+1), deleteEndSegmentLocation);
						
					}
					else if (deleteStartIndex === effectedSegmentOfDeleteStart.startIndex && deleteEndIndex === effectedSegmentOfDeleteEnd.endIndex){

						// updates all the following segments
						for (var i = (deleteEndSegmentLocation+1); i <= (segmentsArray.length-1); i++){
						    segmentsArray[i].startIndex -= (deleteEndIndex - deleteStartIndex + 1 );
						    segmentsArray[i].endIndex -= (deleteEndIndex - deleteStartIndex + 1 );
						}

						segmentsArray.delete( (deleteStartSegmentLocation), (deleteEndSegmentLocation));
						
					}
					else {
						console.log("This should never happen, segmentsArray is null,  buildSegmentsWhenDelete");
					}

        		}


        	}
        	else{
        	    console.log("This should never happen, segmentsArray is null,  buildSegmentsWhenDelete when deleteStartIndex === deleteEndIndex");
        	}
        }

        return segmentsArray;

    },

    // build the segments for frontend for a revision
    buildSegmentsForOneRevision: function(segmentsArray, authors) {
        var segments = [];
        var that = this;
        
        _.each(segmentsArray, function(eachSegment) {

            var currentAuthor = _.find(authors, function(eachAuthor) {
                return eachAuthor.id === eachSegment.authorId;
            });
            if (currentAuthor === undefined) {
                var authorColor = "#7F7F7F";

            }
            else{
                var authorColor = currentAuthor.color;
            }

            var segment = that.constructSegmentForFrontend(authorColor, eachSegment.segID, eachSegment.parentSegID, eachSegment.offset, eachSegment.segStr, (eachSegment.endIndex - eachSegment.startIndex + 1), eachSegment.revID, eachSegment.startIndex, eachSegment.endIndex);
            segments.push(segment);
        });

        return segments;

    },

    calculateIntervalChangesIndex: function(logData, timeStamp) {
        var indexArray = [];
        var reducedlogData = _.map(logData, function(val) {
            return val[1];
        });

        _.each(timeStamp, function(val) {
            indexArray.push(_.indexOf(reducedlogData, val));
        });
        return indexArray;
    },
});


// Listen to message sent out from the View
chrome.runtime.onMessage.addListener(
    function(request, sender, sendResponse) {
        switch (request.msg) {
            // If the message is 'changelog', run 'buildRevision'
            case 'changelog':
                window.docuviz.buildRevisions(request.vizType, request.docId, request.changelog, request.authors, request.revTimestamps, request.revAuthors);
                break;

            default:
        }
    });