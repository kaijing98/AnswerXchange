var Notes = require('../models/Notes.js');
var User = require('../models/User.js');
var Notification = require('../models/Notification.js');
var async = require('async');
var fs = require('fs');
const { body,validationResult } = require('express-validator/check');
const { sanitizeBody } = require('express-validator/filter');

/*User gets the page to notesxchange */
exports.notes_xchange_get = function(req, res) {
  res.render('notes_xchange', {user: req.user});
}

/*User gets the page to upload notes */
exports.notes_upload_get = function(req, res) {
  res.render('notes_upload', {user: req.user});
}

 /* Processes the uploading and creation of notes*/
  exports.notes_create_post = [

    (req, res, next) => {
      var notes = new Notes({
        userName: req.user.username,
        userID: req.user,
        date: Date.now(),
        moduleCode: req.body.code,
        semester: req.body.semester,
        vote: 0,
        votedUsers: [],
      });

    notes.file.data = fs.readFileSync(req.file.path);
    console.log(notes.file.data);
    notes.file.mime = req.body.mimeType;
    notes.fileName = req.file.originalname;
    console.log(notes.fileName);
    notes.save(function(err) {
      if (err) {
        console.log("Error in uploading notes");
        return res.status(404).send(err);
      } else {
        console.log("Successfully uploaded notes");
        //Find the user that uploaded the notes and increase his points
        User.findById(notes.userID, function(err, user) {
          user.points += 5;
        });
        res.redirect('/notes_xchange/');
      }
    });
  }
  ];

  /*User gets the page to retrieve notes */
  exports.notes_retrieve_get = function(req, res) {
    res.render('notes_retrieve', {user: req.user});
  }

  /* Post request to get notes for module */
  exports.notes_retrieve_post = function(req, res, next) {
      res.redirect('/notes_list/' + req.body.code);
  }

  /* Get request to get the list from the url */
  exports.notes_list_get = function(req, res, next) {
    async.parallel({
      notes: function(callback) {
        Notes.find({"moduleCode": req.params.code})
          .exec(callback);
      },
    }, function(err, results) {
      if(err) {
        return next(err);
      }

      //If result cannot be found
      if (results.notes.length == 0) {
        res.render('notes_retrieve', {user: req.user,
          errors: "There are no notes uploaded for this module yet."});
      }

      console.log("notes found");
      //found notes, default takes the first set of notes Found
      //to add voting function later and take the set of notes with the most upvotes
      res.render('notes_list', {user: req.user, notes: results.notes,
        code: req.params.code, semester: req.params.semester});
      });
    }

    exports.notes_detail_get = function (req, res, next) {
      //Check that the user has enough points to proceed
      if (req.user.points < 5) {
        res.render('notes_retrieve', {user: req.user,
            errors: "You have insufficient points."});
        return;
      }

      async.parallel({
        notes: function(callback) {
          Notes.findById(req.params.id).exec(callback);
        }
      },
      function (err, results) {
        if (err) {
          return next(err);
        }
        //writes the file in temporary file
        fs.writeFile('temp.pdf', results.notes.file.data, (err) => {
          if (err) throw err;
        });
        console.log('file written!');
        //open file in new tab
        fs.readFile('temp.pdf', function (err, data) {
          res.contentType("application/pdf");
          res.send(data);
        });
        //delete the file
        fs.unlink('temp.pdf', function(err) {
          if (err) {
            return next(err);
          }
        });
        //Find the user that downloaded the notes and decrease his points
        //User is expected to have enough points at this point
        User.findById(req.user._id, function(err, user) {
          user.points -=5;
          User.findByIdAndUpdate(req.user._id, user, function(err, updatedUser) {
            if (err) {
              next(err);
            }
          });
        });
      });
    };

    exports.notes_vote = function(req, res, next) {
      //Get the answer from database
      async.parallel({
        notes: function(callback) {
          Notes.findById(req.params.id).exec(callback);
        },
      }, function(err, results) {
        if (err) {
          next(err);
        }

        results.notes.vote++;
        results.notes.votedUsers.push(req.user);
        var newNotes = results.notes;

        //Find the user and increase his Points
        User.findById(results.notes.userID, function(err, user) {
          user.points += 5;
          var newUser = user;
          User.findByIdAndUpdate(results.notes.userID, newUser, function(err, updatedNotes) {
            if (err) {
              next(err);
            }

            //Create the notification to update the user who posted the answer
            //that he got an upvote
            var notification = new Notification({
              user: results.notes.userID,
              date: Date.now(),
            });
            notification.information = req.user.username + " voted for your notes!";
            notification.link = results.notes.url;

            notification.save(function(err) {
              if (err) {
                return next(err);
              }
              //Find the answer and update it once it is done
              Notes.findByIdAndUpdate(req.params.id, newNotes, function(err, updatedNotes) {
                if (err) {
                  next (err);
                }

                res.redirect('/notes_list/' + results.notes.moduleCode);
              });
            });
          });
        });
      });
    };
