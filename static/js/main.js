/*
  Written by Massimo Di Pierro
  License BSD
  Based on:
   https://github.com/muaz-khan/WebRTC-Experiment/tree/master/RecordRTC 
   http://www.soundstep.com/blog/experiments/jsdetection/ 
   https://github.com/mtschirs/js-objectdetect
*/

// Widget that records the camera, detect motion, filters out noise, and uploas the video via Ajax
// to server when the motion stops. Also performs human detection and color detection for 
// automatic tagging of videos
var RecorderWidget = function(camera, do_upload) {
    self = this;    
    var SECONDS = 1000, RED=0, GREEN=1, BLUE=2;
    self.max_pause_duration = 2*SECONDS; // time without motion when to stop recording
    self.max_video_duration = 60*SECONDS; // max video length
    self.accumulator_threshold = 128; // amount of motion to be ignored
    self.camera = camera; // name of the recoding camera
    self.do_upload = do_upload; // for demo purpose this may be false and video is not uploaded
    self.uploadUrl = '../upload/'; // url where to upload videos
    self.recorderButton = jQuery('#recorder-button'); // name of the button to start recoding
    self.webcam = jQuery('#webcam-source')[0]; // video element associated to the camera
    self.tags_div = jQuery('#tags'); // element where to display assigned tags
    self.recorder = jQuery('#recorder'); // <div that contains the <video> elements below:
    self.canvasSource = jQuery("#canvas-source")[0]; // shows the current frame
    self.canvasBlended = jQuery("#canvas-blended")[0]; // shows the current motion
    self.canvasAccumulator = jQuery("#canvas-accumulator")[0]; // shows the current noise
    self.target = jQuery('#target'); // div that lists all recorded videos
    self.webcamError = function(e) { alert('Webcam error!', e); };
    self.lastImageData;    
    self.contextSource = self.canvasSource.getContext('2d');
    self.contextBlended = self.canvasBlended.getContext('2d');
    self.contextAccumulator = self.canvasAccumulator.getContext('2d');
    self.accumulatedData = null;
    self.eventId = 0;
    self.width = self.webcam.width;
    self.height = self.webcam.height;
    self.recording = null;
    self.lastPostDate = null;
    self.videoCapturing = false;

    /* determine default tags based on the current date */
    self.autoTags = function() {
	var d = Date.create();
	var tags = d.format('{Weekday} {Month} {dd}').toLowerCase().split(' ');
	var h = parseInt(d.format('{H}'));
	if(h>=0 && h<6) tags.push('night');
	else if(h>=6 && h<12) tags.push('morning');
	else if(h>=12 && h<18) tags.push('afternoon');
	else tags.push('evening');
	return tags;
    };

    /* upload a recording to the server */
    self.uploadToServer = function(recording) {
	if(!self.uploadUrl) return; 
	var fd = new FormData();
	fd.append('max_motion', recording.max_motion);
	fd.append('cover_image', recording.cover_image);
	fd.append('start_motion', recording.start_motion);
	fd.append('duration', recording.duration);
	fd.append('tags', recording.tags);
	fd.append('blob', recording.blob);
	fd.append('camera',recording.camera);
	if(self.do_upload)
	    jQuery.ajax({
		type: 'POST',
		url: self.uploadUrl+self.camera,
		data: fd,
		processData: false,
		contentType: false
	    }).done(function(data) {
		if(self.target.length>0)
		    self.target.trigger('reload');
	    });		
    };
    
    // initalization function
    self.init = function() {
	if (navigator.getUserMedia) {
	    // support usermedia but not webkit
	    navigator.getUserMedia({audio: true, video: true}, function(stream) {
		    self.webcam.src = URL.createObjectURL(stream);
		    self.connectStream(stream);
		}, self.webcamError);
	} else if (navigator.webkitGetUserMedia) {
	    // is webkit
	    navigator.webkitGetUserMedia({audio:true, video:true}, function(stream) {
		    self.webcam.src = window.webkitURL.createObjectURL(stream);
		    self.connectStream(stream);
		}, self.webcamError);
	} else {
	    // not supported
	    alert("Not supported");
	}
	// mirror video
	self.contextSource.translate(self.canvasSource.width, 0);
	self.contextSource.scale(-1, 1);	
	self.recorderButton.click(self.toggleVideoCapturing);	
    };

    // connect the recording video stream
    self.connectStream = function(stream) {
	self.recorderButton.attr('disabled',null);
	window.audioVideoRecorder = window.RecordRTC(stream);
    };

    // starts image capturing and toggles the recorder div
    self.toggleVideoCapturing = function() {
	self.videoCapturing = !self.videoCapturing;
	if(self.videoCapturing) {
	    self.update();		
	    self.recorderButton.html('Stop Recording');
	    self.recorder.slideDown();
	} else {
	    self.tags_div.html('');
	    self.recorderButton.html('Start Recording');	    
	    self.target.html('');
	    self.recorder.slideUp();
	}
    };
    
    // function to request a single frame
    window.requestAnimFrame = (function(){
	    return  window.requestAnimationFrame   ||
	    window.webkitRequestAnimationFrame ||
	    window.mozRequestAnimationFrame    ||
	    window.oRequestAnimationFrame      ||
	    window.msRequestAnimationFrame     ||
	    function( callback ){
		window.setTimeout(callback, 1000 / 60 *10);
	    };
	})();

    // utility functions for efficient bit manipulations
    function fastAbs(value) { return (value ^ (value >> 31)) - (value >> 31); }
    function threshold(value) { return (value > 0x15) ? 0xFF : 0; }    

    // the overall workflow executed on each frame
    self.update = function() {
	if(self.videoCapturing) {	    
	    var cs = self.contextSource;
	    cs.drawImage(self.webcam, 0, 0, self.width, self.height);
	    // get webcam image data
	    var sourceData = cs.getImageData(0, 0, self.width, self.height);
	    // create a ImageData instance to receive the accumulated motion
	    if(!self.accumulatedData) 
		self.accumulatedData = cs.createImageData(self.width, self.height);
	    if(self.lastImageData) {
		// create a ImageData instance to receive the blended result
		var blendedData = cs.createImageData(self.width, self.height);
		// blend the 2 images
		self.processDifference(blendedData.data, self.accumulatedData.data, 
				       sourceData.data, self.lastImageData.data);
		// draw the result in a canvas
		self.contextBlended.putImageData(blendedData, 0, 0);
		self.contextAccumulator.putImageData(self.accumulatedData, 0, 0);
		// store the current webcam image
	    }
	    self.lastImageData = sourceData;
	    window.requestAnimFrame(self.update);
	}
    };

    // act on the difference between two frames
    self.processDifference = function(difference, accumulator, data1, data2) {
	var now = new Date().getTime();
	var invalid = 0;
        var valid = 0;
	var acc;
	var red=0, green=0, blue=0;
	var rgb, tags;
	var average1, average2, diff;
	// loop over pixes
	for(var j=0; j<data1.length; j+=4) {	    
	    // compute average pixel difference
	    average1 = (data1[j] + data1[j+1] + data1[j+2]) / 3;
	    average2 = (data2[j] + data2[j+1] + data2[j+2]) / 3;
	    diff = threshold(fastAbs(average1 - average2));
	    difference[j+1] = diff;
	    difference[j+3] = 0xFF;
	    // accumulate difference if semi-isolated pixel
	    acc = accumulator[j+0];
	    if(acc>0) acc-=1;
	    if(diff && j>4*self.webcam.width) {
		if(difference[j-4+1] && difference[j-4*self.webcam.width+1] && 
		   acc<self.accumulator_threshold) {
		    valid++;
		    red+=data2[j]; green+=data2[j+1]; blue+=data2[j+2];
		    acc = Math.min(acc+10,255); 
		} else {
		    invalid++;
		}
	    }
	    accumulator[j+0] = acc;
	    accumulator[j+3] = 0xFF;
	}
	// record if significative motion
	if(valid>1e4 && valid>invalid) {
	    if(!self.recording) {		
		tags = self.autoTags();
		self.recording = {tags:tags, id:self.eventId++, start_motion: now, 
			     duration:0, rgb:[0,0,0], max_motion:valid, 
			     cover_image:self.canvasSource.toDataURL(), 
			     camera:self.camera};
		console.log('start recording');
		window.audioVideoRecorder.startRecording();
	    } else if(valid>self.recording.max_motion)	{
		self.recording.max_motion = valid;
		self.recording.cover_image = self.canvasSource.toDataURL();		
		self.recording.rgb = [red, green, blue];
	    }
	    last_motion = now;
	    self.detectObjects();	    
	} else {
	    if(self.recording && ((now-last_motion)>self.max_pause_duration || 
			     (now-self.recording.start_motion)>self.max_video_duration)) {
		console.log('stop recording');
		rgb = self.recording.rgb;
		window.audioVideoRecorder.stopRecording(function(url){
			if(rgb[0]>rgb[1]+rgb[2]) self.recording.tags.push('red');
			if(rgb[1]>rgb[0]+rgb[2]) self.recording.tags.push('green');
			if(rgb[2]>rgb[0]+rgb[1]) self.recording.tags.push('blue');
			self.recording.duration = now - self.recording.start_motion;
			self.recording.blob = window.audioVideoRecorder.getBlob();		    
			self.uploadToServer(self.recording);
			self.lastPostDate = now;
		    });
		self.recording = null;
	    } else if(!self.recording && now-self.lastPostDate>self.max_video_duration) {		
		var tags = self.autoTags();
		self.recording = {tags:tags, id:self.eventId++, start_motion: now, 
			     duration:0, max_motion:0, camera:self.camera,
			     cover_image:self.canvasSource.toDataURL() };
		self.uploadToServer(self.recording);
		self.lastPostDate = now;
		self.recording = null;
	    }
	}
	var dt = (self.recording)?Math.floor((now-self.recording.start_motion)/SECONDS):0; 
	self.tags_div.html((self.recording)?('recording event #'+self.eventId+
				   ' ('+dt+'s)... labeling as '+
				   self.recording.tags.join(' ')):'');
    }
    self.detectObjects = function() {	
	if (self.webcam.readyState === self.webcam.HAVE_ENOUGH_DATA) {
	    var options = {size:300, scaleMin: 8, scaleFactor: 1.2, 
			   classifier: objectdetect.frontalface}
	    jQuery(self.webcam).objectdetect("all", options, function(coords) {
		if(coords.length>0) {
		    if(self.recording && self.recording.tags.indexOf('human')<0) 
			self.recording.tags.push('human');
		}
	    });
	}
    }

    self.init();
};

// widget that displays a matrix of past uploaded videos (can be searched by tag)
var GridWidget = function(camera) {
    // masonry logic
    var self = jQuery(this);
    self.camera = camera;
    self.container = document.querySelector('#target'); // the container displaying the matrix
    self.msnry = new Masonry(self.container, { columnWidth: 10,itemSelector: '.tv', 
					 isFitWidth: true});
    self.earliestDate = null; // the date of the earliest video displayed
    self.latestDate = null; // the date of the latest video displayed
    self.search_url = '../search'; // the search URL
    self.video_url = '../video/'; // the URL to fetch a video by ID (append the ID)

    // play a given video in the tv-target
    self.play = function(event) {
	try {
	    jQuery('.tv').css('border','5px solid white');
	    var target = jQuery(event.target);
	    target.parent().css('border','5px solid #1abc9c');
	    var video = jQuery('video#tv-target').show();
	    var record = target.data('record');
	    video.attr('src',self.video_url+record.id).get(0).play();
	    jQuery('#modal-title').html(record.start_motion+'/'+record.duration);
	    jQuery('.modal').modal('show')
	} catch(e) {alert(e);};
    };
    
    // query the server for videos
    self.fetchEvents = function(limit, order, date){
	var query = {tags:jQuery('#filters').val(),camera:self.camera,limit:limit};
	if(date && order=='prepend') query.before = date;
	if(date && order=='append') query.after = date;
	query.camera = self.camera;
	jQuery.getJSON(self.search_url, query, function(data) {
		var elems = [];
		var fragment = document.createDocumentFragment();
		for(k=0; k<data.length; k++) {
		    var record=data[k];
		    if(!self.earliestDate || record.start_motion<self.earliestDate) 
			self.earliestDate = record.start_motion;
		    if(!self.latestDate || record.start_motion>self.latestDate) 
			self.latestDate = record.start_motion;
		    var div = jQuery('<div class="tv"/>');
		    div.append(jQuery('<div class="date"/>').html
			       (record.start_motion+'/'+record.duration));
		    div.append(jQuery('<div class="tags"/>').html(record.tags.join(', ')));
		    var img = jQuery('<img/>').attr('src',record.cover_image);
		    img.data('record',record);
		    div.mouseover(function(){jQuery(this).find('.tags').show();});
		    div.mouseout(function(){jQuery(this).find('.tags').hide();});
		    if(record.duration>0) img.click(self.play);
		    div.append(img);
		    fragment.appendChild( div.get(0) );
		    elems.push( div.get(0) );
		}
		if(elems) {
		    self.container.insertBefore( fragment, self.container.firstChild );
		    if(order=='append') self.msnry.appended( elems );
		    else if(order=='prepend') self.msnry.prepended( elems );
		    jQuery('#loading').hide();
		}
	    });	
    };

    // load latest 10 videos
    self.loadEvents = function(event) {
	event.preventDefault();
	jQuery(self.container).html('');
	self.earliestDate = self.latestDate = null;
	jQuery('#loading').show();
	self.fetchEvents(10,'prepend');
    };
    
    // load 10 videos before the earliest one displayed
    self.loadPreviousEvents = function(event) {
	event.preventDefault();
	if(jQuery('.tv').length>0) {
	    jQuery('#loading').show();    
	    self.fetchEvents(10,'prepend',self.earliestDate);
	}
    };

    // load 10 videos after the latest one displayed
    self.loadNextEvents = function(event) {
	event.preventDefault();
	if(jQuery('.tv').length>0) {
	    jQuery('#loading').show();
	    self.fetchEvents(10,'append',self.latestDate);
	}
    };
    
    // global plumbing connects events to actions
    jQuery('#target').on('reload',function(){ self.fetchEvents(1,'append', self.latestDate); });    
    jQuery('#filters-button').click(self.loadEvents);
    jQuery('#prev').click(self.loadPreviousEvents);
    jQuery('#next').click(self.loadNextEvents);
    jQuery('#filters').keyup(function(event){if(event.keyCode==13) self.loadEvents(event);});
    jQuery('.collapsible').each(function(){jQuery(this).click(function(){jQuery(this).slideToggle();});});
    jQuery('#recorder-button').attr('disabled',true);    
};

// figure out the name of the camera from the URL
var camera = window.location.href.split('/').pop().split('#')[0];
// display the recorder widget
var recorder = new RecorderWidget(camera, window.have_user);
// and the player widget
var player = new GridWidget(camera);
// show some examples of tags to help new users
jQuery('#filters').html('').attr('title', 'Example: '+recorder.autoTags().join(' '));
