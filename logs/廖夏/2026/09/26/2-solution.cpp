#include<iostream>
#include<string>
#include<cmath>
using namespace std;
int main(){
    int t; cin >> t;
    while(t--){
        int n; char c; string s; cin >> n >> c >> s;
        int res = 0;
        int l = 0, r = n - 1;
        while(l < r){
            if (s[l] != s[r]){
                res += s[l] == c ? 0 : 1;
                res += s[r] == c ? 0 : 1;
            }
            l++, r--;
        }
        cout << res << endl;
    }
    return 0;
}