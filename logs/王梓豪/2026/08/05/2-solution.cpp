#include<iostream>
#include<vector>
#include<algorithm>
using namespace std;
int main()
{
    int t;
    cin>>t; 
    while(t--)
    {
        int n;
        cin>>n;
        string a,b;
        cin>>a>>b;
        int cnta0=0,cnta1=0;
        int cntb0=0,cntb1=0;
        for(int i=0;i<n;i+=2)
        {
            if(a[i]=='1')
            cnta0++;
            if(b[i]=='1')
            cntb0++;
        }
        for(int i=1;i<n;i+=2)
        {
            if(a[i]=='1')
            cnta1++;
            if(b[i]=='1')
            cntb1++;
        }
        if(cnta0==cntb0 && cnta1==cntb1)
        {
            cout<<"YES"<<endl;
        }
        else
        {
            cout<<"NO"<<endl;
        }
    }
}